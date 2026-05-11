// consumes params that tell us where we are and where our target is.
// SegmentSchedulers job is to get segments and return them back using SegmentFetcher
// also has to track state of pending requests between calls (this is going to be in 100ms loop)

import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import type { SegmentUrl } from "../segment_url/segment_url";
import { Effect } from "effect";
import { DashManifest } from "../dash_manifest/dash_manifest";
import { Codec } from "../codec/codec";
import { SegmentQueue } from "../segment_queue/segment_queue";

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
    // preferredPlaylist: { height: number; bandwidth: number };
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
    Effect.gen(function*() {
      const toFetch: Array<{
        mimeType: Codec.MimeType.Type;
        segment: DashManifest.DashSegment;
      }> = [];
      const preferredPlaylist = {
        height: recommendedPlaylist.attributes.RESOLUTION?.height ?? 0,
        bandwidth: recommendedPlaylist.attributes.BANDWIDTH,
      }
      console.log(requested);
      for (const [codec, neededBuffer] of requested) {
        // long term we dont want to rely on mime type prefix for this...
        if (Codec.MimeType.toString(codec).startsWith("video")) {
          const playlist = DashManifest.getPlaylistByHeight(manifest, preferredPlaylist.height);
          const currentSegment = DashManifest.findCurrentSegment(playlist, currentTime);
          if (!currentSegment) {
            throw new Error(
              `Invariant violation: Unable to find current segment! ${currentTime} on ${preferredPlaylist.height} for ${codec}`,
            );
          }
          console.log({currentSegment})
          const segmentsToFetch = DashManifest.getSegmentsToFetch(
            playlist.segments,
            currentSegment.number, 
            neededBuffer,
          );

          for (let i = 0; i < segmentsToFetch.length; i++) {
            const s = segmentsToFetch[i];
            if (!s || self.fetchMap.get(s.uri)) {
              continue;
            }
            self.fetchMap.set(s.uri, { kind: "loading" });
            toFetch.push({
              mimeType: codec,
              segment: s,
            });
          }
        }
      }
      // next, push to queue inside daemon and then have buffer manager subscribe.
      // we should have working video after this??? 🤞
      yield* Effect.forkDaemon(
        Effect.forEach(
          toFetch,
          (pending) => {
            if (!pending.segment.resolvedUri) {
              Effect.logWarning('no resolved uri on fetch daemon');
            }
            console.log('from fork')
            return SegmentFetcher.fetch(pending.segment.resolvedUri ?? '').pipe(
              Effect.flatMap((data) => {
                console.log('data!', data)
                return SegmentQueue.add(segmentQueue, {
                  data,
                  segment: pending.segment,
                });
              }),
            )
          },
          { concurrency: 1 },
        ),
      );
      return self;
    });
}
