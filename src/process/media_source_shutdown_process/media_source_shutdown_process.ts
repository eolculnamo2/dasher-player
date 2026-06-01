import { Effect } from "effect";
import { MediaSourceModule } from "@/src/core/media_source/media_source";
import { SourceBufferModule } from "@/src/core/source_buffer/source_buffer";
import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import type { MediaElement } from "@/src/core/media_element/media_element";

export namespace MediaSourceShutdownProcess {
  // this is aggressive for now. Would like to lower in the future
  const DURATION_EPSILON_SECONDS = 0.5;

  export const endStream = (
    mediaSource: MediaSourceModule.OpenedMediaSource.Type,
    buffers: BufferManager.Type,
    mediaElement: MediaElement.Type,
  ) =>
    Effect.gen(function* () {
      // I'm worried this check may cause problems if the manifest duration is too far off from reality.
      // may play with a large epsilon value
      if (mediaElement.duration - DURATION_EPSILON_SECONDS > mediaElement.currentTime) {
        return;
      }

      const finalDuration = BufferManager.getPlayableBufferEnd(buffers);
      if (!finalDuration) {
        yield* Effect.logWarning("failed to end stream due to null buffer end");
        return;
      }

      if (finalDuration - DURATION_EPSILON_SECONDS > mediaElement.currentTime) {
        return;
      }

      const sourceBuffers = Array.from(buffers.buffers.values());

      if (mediaSource.readyState === "ended") {
        return;
      }

      if (mediaSource.readyState === "closed") {
        yield* Effect.logWarning("cannot end closed media source");
        return;
      }

      if (mediaSource.readyState !== "open") {
        yield* Effect.logWarning(
          "expected open media source, attempting wait. Current readyState: " +
            mediaSource.readyState,
        );
        yield* MediaSourceModule.waitForSourceOpen(mediaSource);
      }

      if (!Number.isFinite(finalDuration) || finalDuration < 0) {
        yield* Effect.logWarning(
          "cannot end media source with invalid final duration: " + finalDuration,
        );
        return;
      }

      yield* Effect.forEach(sourceBuffers, SourceBufferModule.waitForOpenBuffer, { discard: true });
      yield* BufferManager.removeBeyondDuration(
        sourceBuffers,
        finalDuration,
        DURATION_EPSILON_SECONDS,
      );
      yield* Effect.forEach(sourceBuffers, SourceBufferModule.waitForOpenBuffer, { discard: true });

      const highestBufferedEnd = BufferManager.getHighestBufferedEnd(sourceBuffers);
      if (
        highestBufferedEnd != null &&
        highestBufferedEnd > finalDuration + DURATION_EPSILON_SECONDS
      ) {
        yield* Effect.logWarning(
          `cannot lower media source duration to ${finalDuration}; buffered coded frames still end at ${highestBufferedEnd}`,
        );
        return;
      }

      // this seems to be the wrong thing to do -- browsers do this internally based on our already trimmed source buffers.
      // Will remove commented out code in time
      // yield* Effect.logInfo(`Ending stream. Setting source dur to ${finalDuration}`);
      // mediaSource.duration = finalDuration;

      try {
        mediaSource.endOfStream();
      } catch (e) {
        console.error("Failed to call end of stream", e);
      }
    });
}
