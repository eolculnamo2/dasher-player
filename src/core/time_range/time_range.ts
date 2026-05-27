import { Duration } from "effect";
import type { DashManifest } from "../dash_manifest/dash_manifest";

export namespace TimeRange {
  const DEFAULT_EPSILON = Duration.millis(50);

  export type Type = {
    start: Duration.Duration;
    end: Duration.Duration;
  };

  export type CombineTimeRange = (ranges: Array<Type>) => Type | null;
  export const combineTimeRange: CombineTimeRange = (ranges) => {
    if (ranges.length === 0) {
      return null;
    }

    return fromRaw({
      start: Math.min(...ranges.map((range) => Duration.toSeconds(range.start))),
      end: Math.max(...ranges.map((range) => Duration.toSeconds(range.end))),
    });
  };

  export type FromRaw = (raw: { start: number; end: number }) => Type;
  export const fromRaw: FromRaw = ({ start, end }) => ({
    start: Duration.seconds(start),
    end: Duration.seconds(end),
  });

  export type FromSegment = (segment: DashManifest.DashSegment) => Type;
  export const fromSegment: FromSegment = (segment) =>
    fromRaw({
      start: segment.presentationTime,
      end: segment.presentationTime + (segment.duration ?? 0),
    });

  export type Overlaps = (
    range: Type,
    otherRange: Type,
    options?: { epsilon?: Duration.Duration },
  ) => boolean;
  export const overlaps: Overlaps = (range, otherRange, { epsilon = DEFAULT_EPSILON } = {}) => {
    const rangeStart = Duration.toSeconds(range.start);
    const rangeEnd = Duration.toSeconds(range.end);
    const otherStart = Duration.toSeconds(otherRange.start);
    const otherEnd = Duration.toSeconds(otherRange.end);
    const epsilonSeconds = Duration.toSeconds(epsilon);

    return rangeStart < otherEnd + epsilonSeconds && rangeEnd > otherStart - epsilonSeconds;
  };
}
