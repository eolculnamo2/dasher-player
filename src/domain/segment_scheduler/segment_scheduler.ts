// consumes params that tell us where we are and where our target is.
// SegmentSchedulers job is to get segments and return them back using SegmentFetcher
// also has to track state of pending requests between calls (this is going to be in 100ms loop)

import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import type { SegmentUrl } from "../segment_url/segment_url";
import { Effect } from "effect";
import { DashManifest } from "../dash_manifest/dash_manifest";
import { Codec } from "../codec/codec";
import { SegmentQueue } from "../segment_queue/segment_queue";
import { VideoTick } from "./video-tick/video-tick";
import { AudioTick } from "./audio-tick/audio-tick";

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

  export type TickParams = {
    manifest: DashManifest.Type;
    segmentQueue: SegmentQueue.Type;
    recommendedPlaylist: DashManifest.Playlist;
    requested: Map<Codec.MimeType.Type, number>;
    currentTime: number;
  };

  // this is where we can make the behavior slick.. i.e. can swap out hanging segments for different bitrate or multi cdn
  // this is also a mess right now; I will go back and treat this like a nested, this orchestrator + properly decompose its pieces
  // after i can prove that I can get video + audio working together for happy path
  export const tick = (
    self: Type,
    { manifest, recommendedPlaylist, requested, currentTime, segmentQueue }: TickParams,
  ) =>
    Effect.gen(function* () {
      const preferredPlaylist = {
        height: recommendedPlaylist.attributes.RESOLUTION?.height ?? 0,
        bandwidth: recommendedPlaylist.attributes.BANDWIDTH,
      };
      const toFetch = Effect.all(
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
              preferredPlaylist,
              currentTime,
              mimeType,
              neededBuffer,
            });
          }
          return Effect.sync(() => ({
            mimeType,
            segments: []
          }));
        }),
      ).pipe(
        Effect.map((items) => items.map((item) => {
          return item.segments.map((segment) => ({
            mimeType: item.mimeType,
            segment,
          })).filter((item) => {
            if (self.fetchMap.get(item.segment.uri)) {
              return false;
            }
            self.fetchMap.set(item.segment.uri, { kind: "loading" });
            return true;
          })
        })),
        Effect.map((items) => items.flat())
      );

      const readyForFetch = yield* toFetch;
      yield* Effect.forkDaemon(
        Effect.forEach(
          readyForFetch,
          (pending) => {
            if (!pending.segment.resolvedUri) {
              Effect.logWarning("no resolved uri on fetch daemon");
            }
            return SegmentFetcher.fetch(pending.segment.resolvedUri ?? "").pipe(
              Effect.flatMap((data) => {
                return SegmentQueue.add(segmentQueue, {
                  data,
                  segment: pending.segment,
                  mimeType: pending.mimeType,
                });
              }),
            );
          },
          { concurrency: 4 },
        ),
      );
      return self;
    });
}
