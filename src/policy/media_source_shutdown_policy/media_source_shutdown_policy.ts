import { Effect } from "effect";
import { MediaSourceModule } from "@/src/core/media_source/media_source";
import { SourceBufferModule } from "@/src/core/source_buffer/source_buffer";
import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";

export namespace MediaSourceShutdownPolicy {
  // this is aggressive for now. Would like to lower in the future
  const DURATION_EPSILON_SECONDS = .5;

  export const endStream = (
    mediaSource: MediaSourceModule.OpenedMediaSource.Type,
    buffers: BufferManager.Type,
  ) =>
    Effect.gen(function*() {
      const finalDuration = BufferManager.getPlayableBufferEnd(buffers);
      if (!finalDuration) {
        yield* Effect.logWarning('failed to end stream due to null buffer end');
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

      yield* Effect.logInfo(`Ending stream. Setting source dur to ${finalDuration}`);
      mediaSource.duration = finalDuration;
      mediaSource.endOfStream();
    });
}
