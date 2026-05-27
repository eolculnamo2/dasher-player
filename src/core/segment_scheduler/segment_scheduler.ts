// consumes params that tell us where we are and where our target is.
// SegmentSchedulers job is to get segments and return them back using SegmentFetcher
// also has to track state of pending requests between calls (this is going to be in 100ms loop)

import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import type { SegmentUrl } from "../segment_url/segment_url";
import { Duration, Effect, Ref } from "effect";
import { DashManifest } from "../dash_manifest/dash_manifest";
import { Codec } from "../codec/codec";
import { VideoTick } from "./video-tick/video-tick";
import { AudioTick } from "./audio-tick/audio-tick";
import { SegmentPendingQueues } from "../segment_pending_queues/segment_pending_queues";
import type { BufferManager } from "../buffer_manager/buffer_manager";
import { SegmentOrder } from "../segment_order/segment_order";
import { TimeRange } from "../time_range/time_range";
import { FetchMap } from "./fetch-map/fetch-map";

export namespace SegmentScheduler {
  export type Type = {
    fetchMap: FetchMap.Type;
  };
  export const make = () => ({
    fetchMap: FetchMap.make(),
  });

  export const clear = (self: Type) =>
    Effect.sync(() => {
      self.fetchMap.clear();
    });

  export type TickParams = {
    buffer: BufferManager.Type;
    manifest: DashManifest.Type;
    clearedBufferRanges: Array<TimeRange.Type>;
    segmentPendingQueue: SegmentPendingQueues.Type;
    currentPlaylist: Ref.Ref<DashManifest.Playlist>;
    requested: Map<Codec.MimeType.Type, Duration.Duration>;
    mediaElement: HTMLMediaElement;
    lastAppendedSegment: Ref.Ref<SegmentOrder.Type>;
  };

  export const tick = (
    self: Type,
    {
      buffer,
      manifest,
      segmentPendingQueue,
      clearedBufferRanges,
      currentPlaylist,
      requested,
      mediaElement,
      lastAppendedSegment,
    }: TickParams,
  ) =>
    Effect.gen(function* () {
      for (const clearedBufferRange of clearedBufferRanges) {
        FetchMap.clearFromRange(self.fetchMap, clearedBufferRange);
      }

      const playlist = yield* Ref.get(currentPlaylist);
      const playlistId = playlist.attributes.NAME;
      const preferredPlaylist = {
        height: playlist.attributes.RESOLUTION?.height ?? 0,
        bandwidth: playlist.attributes.BANDWIDTH,
      };
      const segmentGroups = yield* Effect.all(
        Array.from(requested.entries()).map(([mimeType, neededBuffer]) => {
          if (Codec.MimeType.toString(mimeType).startsWith("video")) {
            return VideoTick.handle({
              manifest,
              preferredPlaylist,
              buffer,
              mimeType,
              neededBuffer,
              mediaElement,
            });
          }
          if (Codec.MimeType.toString(mimeType).startsWith("audio")) {
            return AudioTick.handle({
              manifest,
              buffer,
              mimeType,
              neededBuffer,
              mediaElement,
            });
          }
          return Effect.sync(() => ({
            isNewBuffer: false,
            mimeType,
            segments: [],
          }));
        }),
      );

      for (const { mimeType, segments, isNewBuffer } of segmentGroups) {
        if (isNewBuffer) {
          yield* SegmentOrder.resetByMimeType(lastAppendedSegment, mimeType);
        }
        for (const segment of segments) {
          if (self.fetchMap.get(segment.uri)) {
            continue;
          }
          const kind = SegmentPendingQueues.kindFromMimeType(mimeType);
          if (!kind) {
            continue;
          }
          self.fetchMap.set(segment.uri, { kind: "loading", range: TimeRange.fromSegment(segment) });
          yield* SegmentPendingQueues.add(segmentPendingQueue, kind, {
            mimeType,
            segment,
            playlistId,
          });
        }
      }

      return self;
    });
}
