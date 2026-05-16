import { describe, expect, spyOn, test } from "bun:test";
import { BufferManager } from "../buffer_manager/buffer_manager";
import { DashManifest } from "../dash_manifest/dash_manifest";
import { BufferZone } from "./buffer_zone";

const makeTimeRanges = (ranges: ReadonlyArray<readonly [number, number]>): TimeRanges =>
  ({
    length: ranges.length,
    start: (index: number) => {
      const range = ranges[index];
      if (!range) {
        throw new Error(`No range at index ${index}`);
      }
      return range[0];
    },
    end: (index: number) => {
      const range = ranges[index];
      if (!range) {
        throw new Error(`No range at index ${index}`);
      }
      return range[1];
    },
  }) as TimeRanges;

const makeBufferManager = (bufferAheadSeconds: number): BufferManager.Type =>
  ({
    buffers: new Map([
      [
        "video/mp4",
        {
          buffered: makeTimeRanges([[0, bufferAheadSeconds]]),
        } as SourceBuffer,
      ],
    ]),
  }) as unknown as BufferManager.Type;

const makeManifest = (isLive: boolean): DashManifest.Type =>
  ({
    allowCache: true,
    endList: !isLive,
    playlists: [],
    mediaGroups: {
      AUDIO: {},
      VIDEO: {},
      "CLOSED-CAPTIONS": {},
      SUBTITLES: {},
    },
    duration: isLive ? Infinity : 60,
    discontinuityStarts: [],
  }) as DashManifest.Type;

const getZone = (bufferAheadSeconds: number, isLive: boolean): BufferZone.Type => {
  const isLiveSpy = spyOn(DashManifest, "isLive").mockImplementation(() => isLive);

  try {
    return BufferZone.get({
      bufferManager: makeBufferManager(bufferAheadSeconds),
      manifest: makeManifest(isLive),
      mediaElement: { currentTime: 0 } as HTMLMediaElement,
    });
  } finally {
    isLiveSpy.mockRestore();
  }
};

describe("BufferZone.get", () => {
  describe("static manifests", () => {
    test.each([
      [2.99, "critical"],
      [3, "caution"],
      [7.99, "caution"],
      [8, "reservoir"],
      [19.99, "reservoir"],
      [20, "healthy"],
    ] as const)("returns %s seconds as %s", (bufferAheadSeconds, expected) => {
      expect(getZone(bufferAheadSeconds, false)).toBe(expected);
    });
  });

  describe("live manifests", () => {
    test.each([
      [1.99, "critical"],
      [2, "caution"],
      [3.99, "caution"],
      [4, "reservoir"],
      [4.99, "reservoir"],
      [5, "healthy"],
    ] as const)("returns %s seconds as %s", (bufferAheadSeconds, expected) => {
      expect(getZone(bufferAheadSeconds, true)).toBe(expected);
    });
  });
});
