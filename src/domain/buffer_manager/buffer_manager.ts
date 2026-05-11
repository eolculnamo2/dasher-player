// registers and attaches source buffers;
// manages their state;
// provides API for adding and removing content from buffer
import { Data, Duration, Effect, Queue, Chunk } from "effect";
import type { Codec } from "../codec/codec";
import { MediaSourceModule } from "../media_source/media_source";
import { SourceBufferModule } from "../source_buffer/source_buffer";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { DashManifest } from "../dash_manifest/dash_manifest";
import type { SegmentQueue } from "../segment_queue/segment_queue";

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

      // yield* SourceBufferModule.attachSegment(sourceBuffer, initSegment);
      SourceBufferModule.attachSegment(sourceBuffer, initSegment);

      self.buffers.set(mimeType, sourceBuffer);
      return sourceBuffer;
    });

  // note: may not end up being the best thing to pass around raw source buffers
  export const attachSegment = (sourceBuffer: SourceBufferModule.Type, segment: ArrayBuffer) =>{
      console.log('attaching');
      return SourceBufferModule.attachSegment(sourceBuffer, segment);
  }

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

    for (const [mimeType, sourceBuffer] of self.buffers.entries()) {
      aheadMap.set(mimeType, getSourceBufferAhead(sourceBuffer, currentTime));
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
    for (const [mimeType, bufferedAhead] of aheadMap.entries()) {
      behindTargetMap.set(mimeType, Duration.toSeconds(DEFAULT_BUFFERING_GOAL) - bufferedAhead);
    }
    return behindTargetMap;
  };

  // will have to deal with more than one buffer for audio -- and ordering is non existent in practice
  export const flushSegmentQueue = (self: Type, mimeType: Codec.MimeType.Type, segmentQueue: SegmentQueue.Type) => Effect.gen(function* (){
    const flushed = yield* Queue.takeAll(segmentQueue.queue).pipe(
      Effect.map(Chunk.toArray),
      Effect.map(data => data.toSorted(d => d.segment.number > d.segment.number ? 1 : -1)));
    const buffer = self.buffers.get(mimeType);
    if (!buffer) {
      throw new Error(`invariant violation - no buffer exists for mime type ${mimeType}`)
    }
    for (let i = 0; i < flushed.length; i++) {
      const f = flushed[i];
      if (!f) continue;
      if (buffer.updating) {
        yield* SourceBufferModule.waitForUpdateEnd(buffer);
      }
      attachSegment(buffer, f.data)
    }
  });

  export const make = (): Type => {
    return { buffers: new Map() };
  };
}
