import { Effect } from "effect";
import { MediaSourceModule } from "../media_source/media_source";
import { Codec } from "../codec/codec";

export namespace SourceBufferModule {
  export type Make = (params: {
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    codec: Codec.Type;
  }) => Effect.Effect<SourceBuffer>;
  export const make: Make = ({ mediaSource, codec }) => {
    if (!MediaSourceModule.OpenedMediaSource.isStillOpen(mediaSource)) {
      throw new Error("Invariant violation: MediaSource unexpectedly closed during bootstrapping");
    }
    const sourceBuffer = mediaSource.addSourceBuffer(Codec.asMimeType('video/mp4', codec));
    return Effect.succeed(sourceBuffer);
  };
}
