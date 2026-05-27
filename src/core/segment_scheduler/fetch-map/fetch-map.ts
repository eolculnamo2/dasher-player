import type { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import type { SegmentUrl } from "../../segment_url/segment_url";
import { TimeRange } from "../../time_range/time_range";

export namespace FetchMap {
  namespace SegmentStatus {
    type Base = {
      range: TimeRange.Type;
    };
    // successful loads get pushed straight to queue and removed from map
    export type Type = (
      | { kind: "complete" }
      | { kind: "loading" }
      | { kind: "error"; e: SegmentFetcher.SegmentError }) & Base;
  }

  export type Type = Map<SegmentUrl.Type, SegmentStatus.Type>;
  export const make = () => new Map<SegmentUrl.Type, SegmentStatus.Type>();

  export const clearFromRange = (self: Type, clearRange: TimeRange.Type) => {
    for (const [segmentUrl, status] of self.entries()) {
      if (TimeRange.overlaps(status.range, clearRange)) {
        self.delete(segmentUrl);
      }
    }
  };
}
