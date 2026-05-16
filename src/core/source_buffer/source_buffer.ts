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

  export type Type = SourceBuffer;
  export const make: Make = ({ mediaSource, mimeType }) => {
    if (!MediaSourceModule.OpenedMediaSource.isStillOpen(mediaSource)) {
      throw new Error("Invariant violation: MediaSource unexpectedly closed during bootstrapping");
    }
    const sourceBuffer = mediaSource.addSourceBuffer(Codec.MimeType.toString(mimeType));
    return Effect.succeed(sourceBuffer);
  };

  // this is happy path only right now until we get a working video poc
  export const attachSegment = (self: Type, segment: ArrayBuffer) => self.appendBuffer(segment);

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
        cleanup();
        resume(Effect.fail(new SourceBufferUpdateError({ cause })));
      };

      const onAbort = () => {
        cleanup();
        resume(Effect.fail(new SourceBufferAbortError()));
      };

      sourceBuffer.addEventListener("updateend", onUpdateEnd, { once: true });
      sourceBuffer.addEventListener("error", onError, { once: true });
      sourceBuffer.addEventListener("abort", onAbort, { once: true });

      return Effect.sync(cleanup);
    });
}
