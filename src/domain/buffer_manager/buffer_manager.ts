import { Data, Duration, Effect, Queue, Chunk } from "effect";
import { Codec } from "../codec/codec";
import { MediaSourceModule } from "../media_source/media_source";
import { SourceBufferModule } from "../source_buffer/source_buffer";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { DashManifest } from "../dash_manifest/dash_manifest";
import type { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";

export namespace BufferManager {
  const DEFAULT_BUFFERING_GOAL = Duration.seconds(60);

  export class MissingInitSegmentUrl extends Data.TaggedError("MissingInitSegmentUrl")<{}> {}

  export type Type = {
    buffers: Map<Codec.MimeType.Type, SourceBuffer>;
  };

  type CreateVideoBufferParams = {
    kind: "video";
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    mimeType: Codec.MimeType.Type;
    manifest: DashManifest.Type;
    sourceBuffer: SourceBuffer;
    playlistHeight: number;
  };
  type CreateAudioBufferParams = {
    kind: "audio";
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    mimeType: Codec.MimeType.Type;
    manifest: DashManifest.Type;
    sourceBuffer: SourceBuffer;
  };
  type CreateBufferParams = CreateVideoBufferParams | CreateAudioBufferParams;
  export const createBuffer = (self: Type, params: CreateBufferParams) =>
    Effect.gen(function* () {
      const current = self.buffers.get(params.mimeType);
      if (current) {
        return current;
      }

      const playlist = (() => {
        switch (params.kind) {
          case "video":
            return DashManifest.getPlaylistByHeight(params.manifest, params.playlistHeight);
          case "audio":
            return DashManifest.getAudioPlaylist(params.manifest);
        }
      })();
      if (!playlist) {
        yield* Effect.logDebug(`no playlist available for ${params.kind}`);
        return;
      }
      const initUrl = playlist.segments[0]?.map.resolvedUri;

      if (!initUrl) {
        return yield* Effect.fail(new MissingInitSegmentUrl());
      }

      const initSegment = yield* SegmentFetcher.fetch(initUrl);

      SourceBufferModule.attachSegment(params.sourceBuffer, initSegment);
      yield* Effect.logInfo(`registered ${params.mimeType} to buffer manager`);
      self.buffers.set(params.mimeType, params.sourceBuffer);
      return params.sourceBuffer;
    });

  // create a buffer for every available adaptation set -- just support video and audio for now
  type CreateBuffersParams = {
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    manifest: DashManifest.Type;
    recommendedPlaylist: DashManifest.Playlist;
  };
  export const createBuffers = (
    self: Type,
    { mediaSource, manifest, recommendedPlaylist }: CreateBuffersParams,
  ) =>
    Effect.gen(function* () {
      const audioCodec = DashManifest.getAudioPlaylist(manifest)?.attributes.CODECS;

      // adding source buffer after segments start getting assigned breaks things so do it all at once
      const videoSourceBuffer = yield* SourceBufferModule.make({
        mediaSource: mediaSource,
        mimeType: DashManifest.mimeTypeByPlaylist(recommendedPlaylist),
      });

      const audioSourceBuffer = yield* SourceBufferModule.make({
        mediaSource: mediaSource,
        mimeType: Codec.MimeType.fromCodec("audio/mp4", Codec.makeAudio(audioCodec)),
      });
      yield* BufferManager.createBuffer(self, {
        kind: "video",
        mediaSource,
        manifest,
        mimeType: DashManifest.mimeTypeByPlaylist(recommendedPlaylist),
        playlistHeight: recommendedPlaylist.attributes.RESOLUTION?.height ?? 0,
        sourceBuffer: videoSourceBuffer,
      });

      if (audioCodec) {
        yield* BufferManager.createBuffer(self, {
          kind: "audio",
          mediaSource,
          manifest,
          mimeType: Codec.MimeType.fromCodec("audio/mp4", Codec.makeAudio(audioCodec)),
          sourceBuffer: audioSourceBuffer,
        });
        return {
          audioSourceBuffer,
          videoSourceBuffer,
        };
      }
      Effect.logWarning("Unable to find audio codec");
      return {
        videoSourceBuffer,
      };
    });

  // note: may not end up being the best thing to pass around raw source buffers
  export const attachSegment = (sourceBuffer: SourceBufferModule.Type, segment: ArrayBuffer) => {
    return SourceBufferModule.attachSegment(sourceBuffer, segment);
  };

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
    // no buffer range exists yet (i.e. when first streaming segments)
    return 0;
  };

  export type BufferAheadByCodec = (
    self: Type,
    currentTime: number,
  ) => Map<Codec.MimeType.Type, Duration.Duration>;

  export const bufferAheadByCodec: BufferAheadByCodec = (self, currentTime) => {
    const aheadMap = new Map<Codec.MimeType.Type, Duration.Duration>();

    for (const [mimeType, sourceBuffer] of self.buffers.entries()) {
      aheadMap.set(mimeType, Duration.seconds(getSourceBufferAhead(sourceBuffer, currentTime)));
    }

    return aheadMap;
  };

  export type BufferRunwayByCodec = (
    self: Type,
    currentTime: number,
  ) => Map<Codec.MimeType.Type, Duration.Duration>;

  export const bufferRunwayByCodec: BufferRunwayByCodec = (self, currentTime) =>
    bufferAheadByCodec(self, currentTime);

  export const getBufferRunway = (self: Type, currentTime: number): Duration.Duration => {
    const runwayByCodec = bufferRunwayByCodec(self, currentTime);
    const runways = Array.from(runwayByCodec.values());

    if (runways.length === 0) {
      return Duration.zero;
    }

    return runways.reduce((lowest, runway) =>
      Duration.toMillis(runway) < Duration.toMillis(lowest) ? runway : lowest,
    );
  };

  export type BufferBehindTargetByCodec = (
    self: Type,
    currentTime: number,
  ) => Map<Codec.MimeType.Type, Duration.Duration>;
  export const bufferBehindTargetByCodec: BufferBehindTargetByCodec = (
    self: Type,
    currentTime: number,
  ) => {
    const aheadMap = bufferAheadByCodec(self, currentTime);
    const behindTargetMap = new Map<Codec.MimeType.Type, Duration.Duration>();
    for (const [mimeType, bufferedAhead] of aheadMap.entries()) {
      behindTargetMap.set(
        mimeType,
        Duration.millis(
          Math.max(0, Duration.toMillis(DEFAULT_BUFFERING_GOAL) - Duration.toMillis(bufferedAhead)),
        ),
      );
    }
    return behindTargetMap;
  };

  // will have to deal with more than one buffer for audio -- and ordering is non existent in practice
  export const flushSegmentQueue = (
    self: Type,
    mimeTypes: MapIterator<Codec.MimeType.Type>,
    segmentQueue: SegmentFetchedQueue.Type,
  ) =>
    Effect.gen(function* () {
      const flushed = yield* Queue.takeAll(segmentQueue.queue).pipe(
        Effect.map(Chunk.toArray),
        // keep an eye on this. It might cause weird problems later. It would be better to eventually strictly insert in order into the queue
        // but that is complexity that can be probably be punted in the short term
        // Effect.map((data) => data.toSorted((d) => (d.segment.number > d.segment.number ? 1 : -1))),
      );
      for (const mimeType of mimeTypes) {
        const buffer = self.buffers.get(mimeType);
        if (!buffer) {
          throw new Error(`invariant violation - no buffer exists for mime type ${mimeType}`);
        }
        for (let i = 0; i < flushed.length; i++) {
          const f = flushed[i];
          if (f?.mimeType !== mimeType) {
            continue;
          }
          if (buffer.updating) {
            yield* SourceBufferModule.waitForUpdateEnd(buffer);
          }
          attachSegment(buffer, f.data);
        }
      }
    });

  export const make = (): Type => {
    return { buffers: new Map() };
  };
}
