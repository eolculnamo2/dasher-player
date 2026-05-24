import { Data, Duration, Effect } from "effect";
import { MediaSourceModule } from "../media_source/media_source";
import { Codec } from "../codec/codec";
import { logIfSlow } from "@/src/utils/log_if_slow/log_if_slow";

export namespace SourceBufferModule {
  export type Make = (params: {
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    mimeType: Codec.MimeType.Type;
  }) => Effect.Effect<SourceBuffer>;
  export class SourceBufferUpdateError extends Data.TaggedError("SourceBufferUpdateError")<{
    cause: unknown;
  }> {}

  export class SourceBufferAbortError extends Data.TaggedError("SourceBufferAbortError")<{}> {}
  export class SourceBufferRemoveError extends Data.TaggedError("SourceBufferRemoveError")<{}> {}

  export type Type = SourceBuffer;
  export const make: Make = ({ mediaSource, mimeType }) => {
    if (!MediaSourceModule.OpenedMediaSource.isStillOpen(mediaSource)) {
      throw new Error("Invariant violation: MediaSource unexpectedly closed during bootstrapping");
    }
    const sourceBuffer = mediaSource.addSourceBuffer(Codec.MimeType.toString(mimeType));
    return Effect.succeed(sourceBuffer);
  };

  // this is happy path only right now until we get a working video poc
  export const attachSegment = (self: Type, segment: ArrayBuffer) =>
    logIfSlow(
      Effect.gen(function* () {
        if (self.updating) {
          yield* waitForUpdateEnd(self);
        }
        return self.appendBuffer(segment);
      }),
      "attaching segment is taking longer than expected",
      Duration.seconds(3),
    );

  export const waitForUpdateEnd = (
    sourceBuffer: SourceBuffer,
  ): Effect.Effect<void, SourceBufferUpdateError | SourceBufferAbortError> =>
    logIfSlow(
      Effect.async((resume) => {
        const cleanup = () => {
          sourceBuffer.removeEventListener("updateend", onUpdateEnd);
          sourceBuffer.removeEventListener("error", onError);
          sourceBuffer.removeEventListener("abort", onAbort);
        };

        const onUpdateEnd = () => {
          cleanup();
          resume(Effect.void);
        };

        const onError = (cause: unknown) => {
          console.error("failed to wait for source buffer update end");
          cleanup();
          resume(Effect.fail(new SourceBufferUpdateError({ cause })));
        };

        const onAbort = () => {
          console.warn("source buffer update aborted");
          cleanup();
          resume(Effect.fail(new SourceBufferAbortError()));
        };

        sourceBuffer.addEventListener("updateend", onUpdateEnd, { once: true });
        sourceBuffer.addEventListener("error", onError, { once: true });
        sourceBuffer.addEventListener("abort", onAbort, { once: true });

        return Effect.sync(cleanup);
      }),
      "waiting for source buffer update end is taking longer than expected",
      Duration.seconds(3),
    );

  export const waitForOpenBuffer = (self: Type) =>
    self.updating ? waitForUpdateEnd(self) : Effect.void;

  type RemoveBufferParams = {
    start: number;
    end: number;
  };
  export const removeBuffer = (self: SourceBuffer, { start, end }: RemoveBufferParams) =>
    logIfSlow(
      Effect.gen(function* () {
        console.log("in here", start, end);
        if (end <= start) {
          return;
        }

        if (self.updating) {
          yield* waitForUpdateEnd(self);
        }

        yield* Effect.async<void, SourceBufferRemoveError>((resume) => {
          const onEnd = () => {
            cleanup();
            resume(Effect.void);
          };

          const onError = () => {
            cleanup();
            resume(Effect.fail(new SourceBufferRemoveError()));
          };

          const cleanup = () => {
            self.removeEventListener("updateend", onEnd);
            self.removeEventListener("error", onError);
          };

          self.addEventListener("updateend", onEnd, { once: true });
          self.addEventListener("error", onError, { once: true });

          try {
            console.log("removing", start, end);
            self.remove(start, end);
          } catch (e) {
            console.log("oh no", e);
            cleanup();
            resume(Effect.fail(new SourceBufferRemoveError()));
          }

          return Effect.sync(cleanup);
        });
      }),
      "removing source buffer range is taking longer than expected",
      Duration.seconds(3),
    );

  type BufferedRange = {
    start: number;
    end: number;
  };

  type CleanupOldBufferParams = {
    currentRange: BufferedRange;
    currentTime: number;
    retainBehindSeconds?: number;
  };
  export const cleanupOldBuffer = (
    self: SourceBuffer,
    { currentRange, currentTime, retainBehindSeconds = 8 }: CleanupOldBufferParams,
  ): Effect.Effect<
    void,
    SourceBufferRemoveError | SourceBufferUpdateError | SourceBufferAbortError
  > =>
    logIfSlow(
      Effect.gen(function* () {
        const ranges = Array.from({ length: self.buffered.length }, (_, index) => ({
          start: self.buffered.start(index),
          end: self.buffered.end(index),
        }));
        const retainFrom = Math.max(currentRange.start, currentTime - retainBehindSeconds);

        for (const range of ranges) {
          if (range.end <= currentRange.start || range.start >= currentRange.end) {
            yield* removeBuffer(self, range);
            continue;
          }

          const trimEnd = Math.min(range.end, retainFrom);
          const trimStart = Math.max(range.start, currentRange.start);
          if (trimEnd > trimStart) {
            yield* removeBuffer(self, { start: trimStart, end: trimEnd });
          }
        }
      }),
      "cleaning up old source buffer ranges is taking longer than expected",
      Duration.seconds(3),
    );

  export const clearSourceBuffer = (
    self: SourceBuffer,
  ): Effect.Effect<
    void,
    SourceBufferRemoveError | SourceBufferUpdateError | SourceBufferAbortError
  > =>
    logIfSlow(
      Effect.gen(function* () {
        if (self.buffered.length === 0) {
          return;
        }
        yield* removeBuffer(self, {
          start: 0,
          end: self.buffered.end(self.buffered.length - 1),
        });
      }),
      "clearing source buffer is taking longer than expected",
      Duration.seconds(3),
    );
}
