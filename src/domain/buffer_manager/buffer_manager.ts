// registers and attaches source buffers;
// manages their state;
// provides API for adding and removing content from buffer
import { Data, Effect } from "effect";
import type { Codec } from "../codec/codec";
import { MediaSourceModule } from "../media_source/media_source";
import { SourceBufferModule } from "../source_buffer/source_buffer";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { DashManifest } from "../dash_manifest/dash_manifest";

// ^^ Seems like plenty of responsibility for one module (avoid the temptation to do too much in buffer)
export namespace BufferManager {
  export class MissingInitSegmentUrl extends Data.TaggedError("MissingInitSegmentUrl")<{
    playlistHeight: number;
  }> {}

  export type Type = {
    buffers: Map<Codec.Type, SourceBuffer>;
    state: null; // todo define
  };

  type CreateBufferParams = {
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    codec: Codec.Type;
    manifest: DashManifest.Type;
    playlistHeight: number;
  };
  export const createBuffer = (
    self: Type,
    { mediaSource, codec, manifest, playlistHeight }: CreateBufferParams,
  ) =>
    Effect.gen(function* () {
      const current = self.buffers.get(codec);
      if (current) {
        return current;
      }

      const playlist = DashManifest.getPlaylistByHeight(manifest, playlistHeight);
      const initUrl = playlist.segments[0]?.map.resolvedUri;

      if (!initUrl) {
        return yield* Effect.fail(new MissingInitSegmentUrl({ playlistHeight }));
      }

      const initSegment = yield* SegmentFetcher.fetch(initUrl);
      const sourceBuffer = yield* SourceBufferModule.make({ mediaSource, codec });


      yield* SourceBufferModule.attachSegment(sourceBuffer, initSegment);

      return sourceBuffer;
    });

  // note: may not end up being the best thing to pass around raw source buffers
  export const attachSegment = (sourceBuffer: SourceBufferModule.Type, segment: ArrayBuffer) => Effect.gen(function*() {
      yield* SourceBufferModule.attachSegment(sourceBuffer, segment);
  });

  export const make = (): Type => {
    return { buffers: new Map(), state: null };
  };
}
