import { Data, Duration, Effect, Ref } from "effect";
import { Codec } from "../codec/codec";
import { MediaSourceModule } from "../media_source/media_source";
import { SourceBufferModule } from "../source_buffer/source_buffer";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { DashManifest } from "../dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";
import { SegmentOrder } from "../segment_order/segment_order";
import { MediaElement } from "../media_element/media_element";
import { MediaSourceShutdownPolicy } from "@/src/policy/media_source_shutdown_policy/media_source_shutdown_policy";

export namespace BufferManager {
  const DEFAULT_BUFFERING_GOAL = Duration.seconds(60);

  export class MissingInitSegmentUrl extends Data.TaggedError("MissingInitSegmentUrl")<{}> {}
  export class MissingByMimeType extends Data.TaggedError("MissingByMimeType")<{}> {}

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
      yield* addInit(self, {
        playlist,
        sourceBuffer: params.sourceBuffer,
      });
      yield* Effect.logInfo(`registered ${params.mimeType} to buffer manager`);
      self.buffers.set(params.mimeType, params.sourceBuffer);
      return params.sourceBuffer;
    });

  // create a buffer for every available adaptation set -- just support video and audio for now
  type CreateBuffersParams = {
    mediaSource: MediaSourceModule.OpenedMediaSource.Type;
    manifest: DashManifest.Type;
    currentPlaylist: DashManifest.Playlist;
  };
  export const createBuffers = (
    self: Type,
    { mediaSource, manifest, currentPlaylist }: CreateBuffersParams,
  ) =>
    Effect.gen(function* () {
      const audioCodec = DashManifest.getAudioPlaylist(manifest)?.attributes.CODECS;

      // adding source buffer after segments start getting assigned breaks things so do it all at once
      const videoSourceBuffer = yield* SourceBufferModule.make({
        mediaSource: mediaSource,
        mimeType: DashManifest.mimeTypeByPlaylist(currentPlaylist),
      });

      const audioSourceBuffer = yield* SourceBufferModule.make({
        mediaSource: mediaSource,
        mimeType: Codec.MimeType.fromCodec("audio/mp4", Codec.makeAudio(audioCodec)),
      });
      yield* BufferManager.createBuffer(self, {
        kind: "video",
        mediaSource,
        manifest,
        mimeType: DashManifest.mimeTypeByPlaylist(currentPlaylist),
        playlistHeight: currentPlaylist.attributes.RESOLUTION?.height ?? 0,
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

  export type AddInitParams =
    | {
        playlist: DashManifest.Playlist;
        mimeType: Codec.MimeType.Type;
      }
    | {
        playlist: DashManifest.Playlist;
        sourceBuffer: SourceBuffer;
      };
  export const addInit = (self: Type, params: AddInitParams) =>
    Effect.gen(function* () {
      const initUrl = params.playlist.segments[0]?.map.resolvedUri;

      if (!initUrl) {
        return yield* Effect.fail(new MissingInitSegmentUrl());
      }

      const initSegment = yield* SegmentFetcher.fetch(initUrl);

      const sourceBuffer =
        "sourceBuffer" in params ? params.sourceBuffer : self.buffers.get(params.mimeType);
      if (!sourceBuffer) {
        return yield* Effect.fail(new MissingByMimeType());
      }

      yield* SourceBufferModule.attachSegment(sourceBuffer, initSegment);
    });

  export const findFirstVideoBuffer = (self: Type) => {
    return self.buffers
      .entries()
      .find(([key]) => Codec.MimeType.toString(key).startsWith("video"))?.[1];
  };

  export const findFirstAudioBuffer = (self: Type) => {
    return self.buffers
      .entries()
      .find(([key]) => Codec.MimeType.toString(key).startsWith("audio"))?.[1];
  };

  export const getPlayableBufferEnd = (self: Type): number | null => {
    const sourceBuffers = Array.from(self.buffers.values());
    if (sourceBuffers.length === 0) {
      return null;
    }
    const ends: number[] = [];
    for (const sourceBuffer of sourceBuffers) {
      if (sourceBuffer.buffered.length === 0) {
        return null;
      }
      ends.push(sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1));
    }
    // min because lowest playable is both audio+video
    return Math.min(...ends);
  };

  export const getHighestBufferedEnd = (buffers: SourceBufferModule.Type[]): number | null => {
    let highestEnd: number | null = null;

    for (const buffer of buffers) {
      for (let i = 0; i < buffer.buffered.length; i++) {
        const end = buffer.buffered.end(i);
        highestEnd = highestEnd == null ? end : Math.max(highestEnd, end);
      }
    }

    return highestEnd;
  };

  export const removeBeyondDuration = (
    buffers: SourceBufferModule.Type[],
    finalDuration: number,
    epsilon: number,
  ) =>
    Effect.gen(function* () {
      for (const buffer of buffers) {
        yield* SourceBufferModule.waitForOpenBuffer(buffer);

        for (let i = buffer.buffered.length - 1; i >= 0; i--) {
          const start = buffer.buffered.start(i);
          const end = buffer.buffered.end(i);

          if (end <= finalDuration + epsilon) {
            continue;
          }

          yield* SourceBufferModule.removeBuffer(buffer, {
            start: Math.max(start, finalDuration),
            end,
          });
        }
      }
    });

  export const attachSegment = (sourceBuffer: SourceBufferModule.Type, segment: ArrayBuffer) =>
    Effect.gen(function* () {
      return yield* SourceBufferModule.attachSegment(sourceBuffer, segment);
    });

  type GetSourceBufferAhead = (sourceBuffer: SourceBuffer, currentTime: number) => number;
  const getSourceBufferAhead: GetSourceBufferAhead = (sourceBuffer, currentTime) => {
    const ranges = sourceBuffer.buffered;
    const EPSILON = 0.05;

    const deltas = [];
    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i);
      const end = ranges.end(i);

      if (currentTime >= start - EPSILON && currentTime <= end + EPSILON) {
        deltas.push(Math.max(0, end - currentTime));
      }
    }
    return deltas.length ? Math.max(...deltas) : 0;
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

  export const cleanupOldBuffer = (self: Type, mediaElement: HTMLMediaElement) =>
    Effect.gen(function* () {
      const currentRange = MediaElement.findBufferedRange(mediaElement, mediaElement.currentTime);
      if (!currentRange) {
        if (mediaElement.buffered.length > 1) {
          yield* Effect.logWarning(
            `clearing all buffers; current time ${mediaElement.currentTime} is not in any buffered range`,
          );
          yield* clearAllBuffers(self);
        }
        return;
      }

      for (const sourceBuffer of self.buffers.values()) {
        yield* SourceBufferModule.cleanupOldBuffer(sourceBuffer, {
          currentRange,
          currentTime: mediaElement.currentTime,
        });
      }
    });

  export const clearAllBuffers = (self: Type) =>
    Effect.gen(function* () {
      for (const [_, buffer] of self.buffers) {
        yield* SourceBufferModule.clearSourceBuffer(buffer);
      }
    });

  export const clearVideoBuffer = (self: Type) =>
    Effect.gen(function* () {
      const videoBuffer = findFirstVideoBuffer(self);
      if (!videoBuffer) {
        yield* Effect.logInfo("failed to clear video buffer - buffer not found");
        return;
      }
      yield* SourceBufferModule.clearSourceBuffer(videoBuffer);
    });

  export const clearAudioBuffer = (self: Type) =>
    Effect.gen(function* () {
      const audioBuffer = findFirstAudioBuffer(self);
      if (!audioBuffer) {
        yield* Effect.logInfo("failed to clear audio buffer - buffer not found");
        return;
      }
      yield* SourceBufferModule.clearSourceBuffer(audioBuffer);
    });

  export const flushSegmentQueue = (
    self: Type,
    segmentQueue: SegmentFetchedQueue.Type,
    playlist: Ref.Ref<DashManifest.Playlist>,
    lastAppendedSegment: Ref.Ref<Map<Codec.MimeType.Type, number>>,
  ) =>
    Effect.gen(function* () {
      const mimeTypes = self.buffers.keys();
      const playlistValue = yield* Ref.get(playlist);
      const flushed = (yield* SegmentFetchedQueue.takeAll(segmentQueue))
        .filter((p) => playlistValue.attributes.NAME === p.playlistId)
        .sort((a, b) => a.segment.number - b.segment.number);

      const lastSegmentMap = yield* Ref.get(lastAppendedSegment);
      const appendable = flushed.filter((p) => {
        const lastSegmentNumber = lastSegmentMap.get(p.mimeType);
        return lastSegmentNumber == null || p.segment.number > lastSegmentNumber;
      });

      const isValid = yield* SegmentOrder.validateOrderedCandidates(lastAppendedSegment, {
        candidates: appendable,
      });

      if (!isValid) {
        yield* SegmentFetchedQueue.addMany(segmentQueue, appendable);
        return {
          hasReachedEnd: false,
        };
      }

      const finalSegmentNumber = playlistValue.segments.at(-1)?.number;
      const appendedSegmentMap = new Map(lastSegmentMap);

      let hasFinalSegment = false;
      for (const mimeType of mimeTypes) {
        const buffer = self.buffers.get(mimeType);
        if (!buffer) {
          throw new Error(`invariant violation - no buffer exists for mime type ${mimeType}`);
        }
        let lastUpdated: SegmentFetchedQueue.Queued | null = null;
        for (let i = 0; i < appendable.length; i++) {
          const f = appendable[i];
          if (f?.mimeType !== mimeType) {
            continue;
          }
          yield* attachSegment(buffer, f.data);
          appendedSegmentMap.set(mimeType, f.segment.number);

          lastUpdated = f;
          if (finalSegmentNumber === f.segment.number) {
            hasFinalSegment = true;
          }
        }
        if (lastUpdated != null) {
          yield* Ref.update(lastAppendedSegment, (lastMap) =>
            lastMap.set(mimeType, lastUpdated.segment.number),
          );
        }
      }

      const hasReachedEnd =
        playlistValue.endList &&
        hasFinalSegment &&
        Array.from(self.buffers.keys()).every(
          (key) => appendedSegmentMap.get(key) === finalSegmentNumber,
        );

      return {
        hasReachedEnd,
      };
    });

  export const make = (): Type => {
    return { buffers: new Map() };
  };
}
