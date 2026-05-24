import { Effect } from "effect";
import { MediaSourceModule } from "@/src/core/media_source/media_source";
import { SourceBufferModule } from "@/src/core/source_buffer/source_buffer";

export namespace MediaSourceShutdownPolicy {
  export const endStream = (
    mediaSource: MediaSourceModule.OpenedMediaSource.Type,
    buffers: Iterable<SourceBufferModule.Type>,
    finalDuration: number,
  ) =>
    Effect.gen(function*() {
      const sourceBuffers = Array.from(buffers);

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

      if (mediaSource.duration > finalDuration) {
        yield* Effect.forEach(
          sourceBuffers,
          (buffer) =>
            SourceBufferModule.removeBuffer(buffer, {
              start: finalDuration,
              end: mediaSource.duration,
            }),
          { discard: true },
        );
      }

      yield* Effect.forEach(sourceBuffers, SourceBufferModule.waitForOpenBuffer, { discard: true });

      mediaSource.duration = finalDuration;
      mediaSource.endOfStream();
    });
}
