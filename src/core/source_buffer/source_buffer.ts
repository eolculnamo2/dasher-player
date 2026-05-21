import { Data, Effect } from "effect";
import { MediaSourceModule } from "../media_source/media_source";
import { Codec } from "../codec/codec";

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
    Effect.gen(function* () {
      if (self.updating) {
        yield* waitForUpdateEnd(self);
      }
      return self.appendBuffer(segment);
    });

  export const waitForUpdateEnd = (
    sourceBuffer: SourceBuffer,
  ): Effect.Effect<void, SourceBufferUpdateError | SourceBufferAbortError> =>
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
    });

  type RemoveBufferParams = {
    start: number;
    end: number;
  };
  export const removeBuffer = (self: SourceBuffer, { start, end }: RemoveBufferParams) =>
    Effect.async<void, SourceBufferRemoveError>((resume) => {
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

      self.addEventListener("updateend", onEnd);
      self.addEventListener("error", onError);

      // this is insane to keep because order matters. Going to have to figure out how to manage this
      // potentially at policy level
      if (self.updating) {
        waitForUpdateEnd(self).pipe(
          Effect.tap(() => {
            self.remove(start, end);
            resume(Effect.void);
          }),
        );
      } else {
        resume(Effect.void);
      }
    });

  export const clearSourceBuffer = (
    self: SourceBuffer,
  ): Effect.Effect<void, SourceBufferRemoveError> =>
    Effect.gen(function* () {
      if (self.buffered.length === 0) {
        return;
      }
      yield* removeBuffer(self, {
        start: 0,
        end: self.buffered.end(self.buffered.length - 1),
      });
    });
}
