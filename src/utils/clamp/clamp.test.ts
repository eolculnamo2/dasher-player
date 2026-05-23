import { describe, expect, test } from "bun:test";
import { clamp } from "./clamp";

describe("clamp", () => {
  test.each([
    [{ min: 1, max: 5, value: 0 }, 1],
    [{ min: 1, max: 5, value: 1 }, 1],
    [{ min: 1, max: 5, value: 3 }, 3],
    [{ min: 1, max: 5, value: 5 }, 5],
    [{ min: 1, max: 5, value: 6 }, 5],
  ] as const)("clamps %o to %s", (params, expected) => {
    expect(clamp(params)).toBe(expected);
  });

  test("works with negative ranges", () => {
    expect(clamp({ min: -10, max: -2, value: -12 })).toBe(-10);
    expect(clamp({ min: -10, max: -2, value: -6 })).toBe(-6);
    expect(clamp({ min: -10, max: -2, value: 0 })).toBe(-2);
  });
});
