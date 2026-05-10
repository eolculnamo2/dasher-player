// registers and attaches source buffers;
// manages their state;
// provides API for adding and removing content from buffer
import { Data, Duration, Effect } from "effect";
import type { Codec } from "../codec/codec";
import { MediaSourceModule } from "../media_source/media_source";
import { SourceBufferModule } from "../source_buffer/source_buffer";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { DashManifest } from "../dash_manifest/dash_manifest";

// ^^ Seems like plenty of responsibility for one module (avoid the temptation to do too much in buffer)
export namespace BufferManager {
  const DEFAULT_BUFFERING_GOAL = Duration.seconds(9);

  export class MissingInitSegmentUrl extends Data.TaggedError("MissingInitSegmentUrl")<{
    playlistHeight: number;
  }> { }

  export type Type = {
    buffers: Map<Codec.MimeType.Type, SourceBuffer>;
  };

  type CreateBufferParams = {
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    mimeType: Codec.MimeType.Type;
    manifest: DashManifest.Type;
    playlistHeight: number;
  };
  export const createBuffer = (
    self: Type,
    { mediaSource, mimeType, manifest, playlistHeight }: CreateBufferParams,
  ) =>
    Effect.gen(function*() {
      const current = self.buffers.get(mimeType);
      if (current) {
        return current;
      }

      const playlist = DashManifest.getPlaylistByHeight(manifest, playlistHeight);
      const initUrl = playlist.segments[0]?.map.resolvedUri;

      if (!initUrl) {
        return yield* Effect.fail(new MissingInitSegmentUrl({ playlistHeight }));
      }

      const initSegment = yield* SegmentFetcher.fetch(initUrl);
      const sourceBuffer = yield* SourceBufferModule.make({ mediaSource, mimeType });

      yield* SourceBufferModule.attachSegment(sourceBuffer, initSegment);

      self.buffers.set(mimeType, sourceBuffer);
      return sourceBuffer;
    });

  // note: may not end up being the best thing to pass around raw source buffers
  export const attachSegment = (sourceBuffer: SourceBufferModule.Type, segment: ArrayBuffer) =>
    Effect.gen(function*() {
      yield* SourceBufferModule.attachSegment(sourceBuffer, segment);
    });

  type GetSourceBufferAhead = (sourceBuffer: SourceBuffer, currentTime: number) => number;
  const getSourceBufferAhead: GetSourceBufferAhead = (sourceBuffer, currentTime) => {
    const ranges = sourceBuffer.buffered;
    const EPSILON = 0.05;

    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i);
      const end = ranges.end(i);

      if (currentTime >= start - EPSILON && currentTime <= end + EPSILON) {
        return Math.max(0, end - currentTime);
      }
    }

    // can probably improve handling this case
    console.warn("failed to find buffer range; defaulting to 0");
    return 0;
  };

  export type BufferAheadByCodec = (self: Type, currentTime: number) => Map<Codec.MimeType.Type, number>;

  export const bufferAheadByCodec: BufferAheadByCodec = (self, currentTime) => {
    const aheadMap = new Map<Codec.MimeType.Type, number>();

    for (const [codec, sourceBuffer] of self.buffers.entries()) {
      aheadMap.set(codec, getSourceBufferAhead(sourceBuffer, currentTime));
    }

    return aheadMap;
  };

  export type BufferBehindTargetByCodec = (
    self: Type,
    currentTime: number,
  ) => Map<Codec.MimeType.Type, number>;
  export const bufferBehindTargetByCodec: BufferBehindTargetByCodec = (
    self: Type,
    currentTime: number,
  ) => {
    const aheadMap = bufferAheadByCodec(self, currentTime);
    const behindTargetMap = new Map<Codec.MimeType.Type, number>();
    for (const [codec, bufferedAhead] of aheadMap.entries()) {
      behindTargetMap.set(codec, Duration.toSeconds(DEFAULT_BUFFERING_GOAL) - bufferedAhead);
    }
    return behindTargetMap;
  };

  export const make = (): Type => {
    return { buffers: new Map() };
  };
}
