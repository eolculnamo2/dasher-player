// consumes params that tell us where we are and where our target is.
// SegmentSchedulers job is to get segments and return them back using SegmentFetcher
// also has to track state of pending requests between calls (this is going to be in 100ms loop)

import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import type { SegmentUrl } from "../segment_url/segment_url";
import { Duration, Effect } from "effect";
import { DashManifest } from "../dash_manifest/dash_manifest";

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
    requested: Array<{ start: Duration.DurationValue; end: Duration.DurationValue }>;
  };

  export const tick = (self: Type, { requested }: TickParams): Effect.Effect<Type> => {
    for (const request of requested) {

    }
    return Effect.succeed(self);
  };
}
