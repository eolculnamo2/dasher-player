import { describe, expect, test } from "bun:test";
import { Duration } from "effect";
import { TimeRange } from "./time_range";

describe("TimeRange.combineTimeRange", () => {
  test("returns null for an empty list", () => {
    expect(TimeRange.combineTimeRange([])).toBeNull();
  });

  test("returns the single range unchanged", () => {
    expect(TimeRange.combineTimeRange([TimeRange.fromRaw({ start: 2, end: 4 })])).toEqual(
      TimeRange.fromRaw({ start: 2, end: 4 }),
    );
  });

  test("returns the lowest start and highest end", () => {
    const combinedRange = TimeRange.combineTimeRange([
      TimeRange.fromRaw({ start: 5, end: 10 }),
      TimeRange.fromRaw({ start: 0, end: 4 }),
      TimeRange.fromRaw({ start: 20, end: 30 }),
    ]);

    expect(combinedRange).toEqual(TimeRange.fromRaw({ start: 0, end: 30 }));
  });

  test("returns the envelope for disjoint ranges", () => {
    const combinedRange = TimeRange.combineTimeRange([
      TimeRange.fromRaw({ start: 0, end: 4 }),
      TimeRange.fromRaw({ start: 40, end: 50 }),
    ]);

    expect(combinedRange).toEqual(TimeRange.fromRaw({ start: 0, end: 50 }));
  });
});

describe("TimeRange.fromRaw", () => {
  test("converts seconds to durations", () => {
    const range = TimeRange.fromRaw({ start: 2, end: 4 });

    expect(Duration.toSeconds(range.start)).toBe(2);
    expect(Duration.toSeconds(range.end)).toBe(4);
  });
});

describe("TimeRange.fromSegment", () => {
  test("converts segment presentation time and duration to a range", () => {
    const range = TimeRange.fromSegment({
      uri: "segment-1.m4s",
      resolvedUri: "https://example.com/segment-1.m4s",
      duration: 4,
      map: { uri: "init.mp4" },
      number: 1,
      presentationTime: 10,
    });

    expect(Duration.toSeconds(range.start)).toBe(10);
    expect(Duration.toSeconds(range.end)).toBe(14);
  });
});

describe("TimeRange.overlaps", () => {
  test("returns true for overlapping ranges", () => {
    expect(
      TimeRange.overlaps(
        TimeRange.fromRaw({ start: 2, end: 6 }),
        TimeRange.fromRaw({ start: 4, end: 8 }),
      ),
    ).toBe(true);
  });

  test("returns false for separated ranges", () => {
    expect(
      TimeRange.overlaps(
        TimeRange.fromRaw({ start: 2, end: 4 }),
        TimeRange.fromRaw({ start: 5, end: 8 }),
      ),
    ).toBe(false);
  });

  test("uses epsilon for close boundaries", () => {
    expect(
      TimeRange.overlaps(
        TimeRange.fromRaw({ start: 2, end: 4 }),
        TimeRange.fromRaw({ start: 4.025, end: 8 }),
      ),
    ).toBe(true);
  });
});
