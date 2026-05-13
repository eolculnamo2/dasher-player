// consumes params that tell us where we are and where our target is.
// SegmentSchedulers job is to get segments and return them back using SegmentFetcher
// also has to track state of pending requests between calls (this is going to be in 100ms loop)

import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import type { SegmentUrl } from "../segment_url/segment_url";
import { Duration, Effect } from "effect";
import { DashManifest } from "../dash_manifest/dash_manifest";
import { Codec } from "../codec/codec";
import { VideoTick } from "./video-tick/video-tick";
import { AudioTick } from "./audio-tick/audio-tick";
import { SegmentPendingQueues } from "../segment_pending_queues/segment_pending_queues";

// also cancel requests if the target changes such as when a user seeks out of the previous range
export namespace SegmentScheduler {
  namespace SegmentStatus {
    export type Type = { kind: "loading" } | { kind: "error"; e: SegmentFetcher.SegmentError };
    // successful loads get pushed straight to queue and removed from map
  }

  export type Type = {
    fetchMap: Map<SegmentUrl.Type, SegmentStatus.Type>;
  };
  export const make = () => ({
    fetchMap: new Map<SegmentUrl.Type, SegmentStatus.Type>(),
  });

  export const clear = (self: Type) =>
    Effect.sync(() => {
      self.fetchMap.clear();
    });

  export type TickParams = {
    manifest: DashManifest.Type;
    segmentPendingQueue: SegmentPendingQueues.Type;
    recommendedPlaylist: DashManifest.Playlist;
    requested: Map<Codec.MimeType.Type, Duration.Duration>;
    currentTime: number;
  };

  // make the scheduler as nice as you can 💪
  export const tick = (
    self: Type,
    { manifest, segmentPendingQueue, recommendedPlaylist, requested, currentTime }: TickParams,
  ) =>
    Effect.gen(function* () {
      const preferredPlaylist = {
        height: recommendedPlaylist.attributes.RESOLUTION?.height ?? 0,
        bandwidth: recommendedPlaylist.attributes.BANDWIDTH,
      };
      const segmentGroups = yield* Effect.all(
        Array.from(requested.entries()).map(([mimeType, neededBuffer]) => {
          if (Codec.MimeType.toString(mimeType).startsWith("video")) {
            return VideoTick.handle({
              manifest,
              preferredPlaylist,
              currentTime,
              mimeType,
              neededBuffer,
            });
          }
          if (Codec.MimeType.toString(mimeType).startsWith("audio")) {
            return AudioTick.handle({
              manifest,
              currentTime,
              mimeType,
              neededBuffer,
            });
          }
          return Effect.sync(() => ({
            mimeType,
            segments: [],
          }));
        }),
      );

      for (const { mimeType, segments } of segmentGroups) {
        for (const segment of segments) {
          if (self.fetchMap.get(segment.uri)) {
            continue;
          }
          const kind = SegmentPendingQueues.kindFromMimeType(mimeType);
          if (!kind) {
            continue;
          }
          self.fetchMap.set(segment.uri, { kind: "loading" });
          yield* SegmentPendingQueues.add(segmentPendingQueue, kind, { mimeType, segment });
        }
      }

      return self;
    });
}
