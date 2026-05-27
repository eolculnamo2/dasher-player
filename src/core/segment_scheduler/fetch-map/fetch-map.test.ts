import { describe, expect, test } from "bun:test";
import { TimeRange } from "../../time_range/time_range";
import { FetchMap } from "./fetch-map";

describe("FetchMap.clearFromRange", () => {
  test("clears entries with ranges that overlap the cleared range", () => {
    const fetchMap = FetchMap.make();
    fetchMap.set("before", { kind: "loading", range: TimeRange.fromRaw({ start: 0, end: 2 }) });
    fetchMap.set("inside", { kind: "loading", range: TimeRange.fromRaw({ start: 4, end: 6 }) });
    fetchMap.set("overlap", { kind: "complete", range: TimeRange.fromRaw({ start: 6, end: 9 }) });
    fetchMap.set("after", { kind: "loading", range: TimeRange.fromRaw({ start: 12, end: 14 }) });

    FetchMap.clearFromRange(fetchMap, TimeRange.fromRaw({ start: 3, end: 8 }));

    expect(Array.from(fetchMap.keys())).toEqual(["before", "after"]);
  });

  test("uses epsilon for close boundaries", () => {
    const fetchMap = FetchMap.make();
    fetchMap.set("near", { kind: "loading", range: TimeRange.fromRaw({ start: 7.99, end: 10 }) });

    FetchMap.clearFromRange(fetchMap, TimeRange.fromRaw({ start: 3, end: 7.95 }));

    expect(fetchMap.has("near")).toBe(false);
  });
});
