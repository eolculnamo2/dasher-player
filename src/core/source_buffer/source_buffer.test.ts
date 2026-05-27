import { describe, expect, spyOn, test } from "bun:test";
import { Duration, Effect, Either, Fiber, Logger, TestClock, TestContext } from "effect";
import { Codec } from "@/src/core/codec/codec";
import { MediaSourceModule } from "@/src/core/media_source/media_source";
import { SourceBufferModule } from "./source_buffer";
import { TimeRange } from "../time_range/time_range";

type LogEntry = {
  level: string;
  message: unknown;
};

class FakeMediaSource {
  readyState: MediaSource["readyState"] = "open";
  addedMimeTypes: string[] = [];
  sourceBuffers: FakeSourceBuffer[] = [];

  addSourceBuffer(mimeType: string): SourceBuffer {
    const sourceBuffer = new FakeSourceBuffer();
    this.addedMimeTypes.push(mimeType);
    this.sourceBuffers.push(sourceBuffer);
    return sourceBuffer.asSourceBuffer();
  }
}

class FakeSourceBuffer {
  updating = false;
  buffered: TimeRanges = makeTimeRanges([]);
  appendedSegments: ArrayBuffer[] = [];
  removedRanges: Array<{ start: number; end: number }> = [];
  throwOnRemove = false;
  autoDispatchUpdateEndOnRemove = false;
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  asSourceBuffer(): SourceBuffer {
    return this as unknown as SourceBuffer;
  }

  appendBuffer(segment: ArrayBuffer): void {
    this.appendedSegments.push(segment);
  }

  remove(start: number, end: number): void {
    if (this.throwOnRemove) {
      throw new Error("remove failed");
    }

    this.removedRanges.push({ start, end });

    if (this.autoDispatchUpdateEndOnRemove) {
      this.dispatch("updateend");
    }
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) {
      return;
    }

    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject | null): void {
    if (!listener) {
      return;
    }

    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type: string): void {
    const event = new Event(type);
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

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

const runEither = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(Effect.either(effect));

const runWithTestClockAndLogger = <A, E>(
  effect: Effect.Effect<A, E, never>,
  logs: Array<LogEntry>,
) => {
  const logger = Logger.make<unknown, void>(({ logLevel, message }) => {
    logs.push({ level: logLevel.label, message });
  });

  return Effect.runPromise(
    effect.pipe(
      Effect.provide(TestContext.TestContext),
      Effect.provide(Logger.replace(Logger.defaultLogger, logger)),
    ),
  );
};

const waitForCondition = async (condition: () => boolean) => {
  for (let index = 0; index < 20; index += 1) {
    if (condition()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  throw new Error("Timed out waiting for test condition");
};

const waitForListener = (sourceBuffer: FakeSourceBuffer, type: string) =>
  waitForCondition(() => sourceBuffer.listenerCount(type) > 0);

describe("SourceBufferModule.make", () => {
  test("adds a SourceBuffer using the supplied MIME type", async () => {
    const mediaSource = new FakeMediaSource();
    const mimeType = Codec.MimeType.fromRawCodec("video/mp4", "avc1.640028");

    const sourceBuffer = await Effect.runPromise(
      SourceBufferModule.make({
        mediaSource: mediaSource as unknown as MediaSourceModule.OpenedMediaSource.Type,
        mimeType,
      }),
    );

    const createdSourceBuffer = mediaSource.sourceBuffers[0];
    expect(createdSourceBuffer).toBeDefined();
    if (!createdSourceBuffer) {
      throw new Error("Expected a SourceBuffer to be created");
    }
    expect(sourceBuffer).toBe(createdSourceBuffer.asSourceBuffer());
    expect(mediaSource.addedMimeTypes).toEqual(['video/mp4; codecs="avc1.640028"']);
  });

  test("throws if the opened MediaSource is no longer open", () => {
    const mediaSource = new FakeMediaSource();
    mediaSource.readyState = "closed";

    expect(() =>
      SourceBufferModule.make({
        mediaSource: mediaSource as unknown as MediaSourceModule.OpenedMediaSource.Type,
        mimeType: Codec.MimeType.fromRawCodec("video/mp4", "avc1.640028"),
      }),
    ).toThrow("MediaSource unexpectedly closed");
  });
});

describe("SourceBufferModule.attachSegment", () => {
  test("appends the segment immediately when the SourceBuffer is idle", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const segment = new ArrayBuffer(4);

    await Effect.runPromise(
      SourceBufferModule.attachSegment(sourceBuffer.asSourceBuffer(), segment),
    );

    expect(sourceBuffer.appendedSegments).toEqual([segment]);
    expect(sourceBuffer.listenerCount("updateend")).toBe(0);
  });

  test("waits for the current update to finish before appending", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const segment = new ArrayBuffer(4);
    sourceBuffer.updating = true;

    const promise = Effect.runPromise(
      SourceBufferModule.attachSegment(sourceBuffer.asSourceBuffer(), segment),
    );

    await waitForListener(sourceBuffer, "updateend");
    expect(sourceBuffer.appendedSegments).toEqual([]);

    sourceBuffer.updating = false;
    sourceBuffer.dispatch("updateend");

    await promise;

    expect(sourceBuffer.appendedSegments).toEqual([segment]);
    expect(sourceBuffer.listenerCount("updateend")).toBe(0);
    expect(sourceBuffer.listenerCount("error")).toBe(0);
    expect(sourceBuffer.listenerCount("abort")).toBe(0);
  });
});

describe("SourceBufferModule.waitForUpdateEnd", () => {
  test("completes on updateend and removes listeners", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const promise = Effect.runPromise(
      SourceBufferModule.waitForUpdateEnd(sourceBuffer.asSourceBuffer()),
    );

    await waitForListener(sourceBuffer, "updateend");
    expect(sourceBuffer.listenerCount("updateend")).toBe(1);
    expect(sourceBuffer.listenerCount("error")).toBe(1);
    expect(sourceBuffer.listenerCount("abort")).toBe(1);

    sourceBuffer.dispatch("updateend");
    await promise;

    expect(sourceBuffer.listenerCount("updateend")).toBe(0);
    expect(sourceBuffer.listenerCount("error")).toBe(0);
    expect(sourceBuffer.listenerCount("abort")).toBe(0);
  });

  test("fails with SourceBufferUpdateError on error", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const consoleError = spyOn(console, "error").mockImplementation(() => undefined);

    try {
      const resultPromise = runEither(
        SourceBufferModule.waitForUpdateEnd(sourceBuffer.asSourceBuffer()),
      );
      await waitForListener(sourceBuffer, "error");
      sourceBuffer.dispatch("error");
      const result = await resultPromise;

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(SourceBufferModule.SourceBufferUpdateError);
        expect(result.left.cause).toBeInstanceOf(Event);
      }
      expect(sourceBuffer.listenerCount("updateend")).toBe(0);
      expect(consoleError).toHaveBeenCalledWith("failed to wait for source buffer update end");
    } finally {
      consoleError.mockRestore();
    }
  });

  test("fails with SourceBufferAbortError on abort", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const consoleWarn = spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      const resultPromise = runEither(
        SourceBufferModule.waitForUpdateEnd(sourceBuffer.asSourceBuffer()),
      );
      await waitForListener(sourceBuffer, "abort");
      sourceBuffer.dispatch("abort");
      const result = await resultPromise;

      expect(Either.isLeft(result)).toBe(true);
      if (Either.isLeft(result)) {
        expect(result.left).toBeInstanceOf(SourceBufferModule.SourceBufferAbortError);
      }
      expect(sourceBuffer.listenerCount("updateend")).toBe(0);
      expect(consoleWarn).toHaveBeenCalledWith("source buffer update aborted");
    } finally {
      consoleWarn.mockRestore();
    }
  });

  test("logs when updateend takes longer than three seconds", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const logs: Array<LogEntry> = [];

    await runWithTestClockAndLogger(
      Effect.gen(function* () {
        const fiber = yield* SourceBufferModule.waitForUpdateEnd(
          sourceBuffer.asSourceBuffer(),
        ).pipe(Effect.fork);

        yield* TestClock.adjust(Duration.seconds(3));
        yield* Effect.yieldNow();
        sourceBuffer.dispatch("updateend");

        return yield* Fiber.join(fiber);
      }),
      logs,
    );

    expect(logs).toEqual([
      {
        level: "WARN",
        message: [
          "waiting for source buffer update end is taking longer than expected is taking a while...",
        ],
      },
    ]);
  });
});

describe("SourceBufferModule.removeBuffer", () => {
  test("does nothing when end is not after start", async () => {
    const sourceBuffer = new FakeSourceBuffer();

    await Effect.runPromise(
      SourceBufferModule.removeBuffer(sourceBuffer.asSourceBuffer(), { start: 4, end: 4 }),
    );

    expect(sourceBuffer.removedRanges).toEqual([]);
    expect(sourceBuffer.listenerCount("updateend")).toBe(0);
  });

  test("removes the range and completes on updateend", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const resultPromise = Effect.runPromise(
      SourceBufferModule.removeBuffer(sourceBuffer.asSourceBuffer(), { start: 1, end: 3 }),
    );

    await waitForCondition(() => sourceBuffer.removedRanges.length === 1);
    expect(sourceBuffer.removedRanges).toEqual([{ start: 1, end: 3 }]);
    expect(sourceBuffer.listenerCount("updateend")).toBe(1);

    sourceBuffer.dispatch("updateend");
    await resultPromise;

    expect(sourceBuffer.listenerCount("updateend")).toBe(0);
    expect(sourceBuffer.listenerCount("error")).toBe(0);
  });

  test("waits for an in-progress update before removing", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    sourceBuffer.updating = true;
    const resultPromise = Effect.runPromise(
      SourceBufferModule.removeBuffer(sourceBuffer.asSourceBuffer(), { start: 1, end: 3 }),
    );

    await waitForListener(sourceBuffer, "updateend");
    expect(sourceBuffer.removedRanges).toEqual([]);

    sourceBuffer.updating = false;
    sourceBuffer.dispatch("updateend");
    await waitForCondition(() => sourceBuffer.removedRanges.length === 1);
    expect(sourceBuffer.removedRanges).toEqual([{ start: 1, end: 3 }]);

    sourceBuffer.dispatch("updateend");
    await resultPromise;
  });

  test("fails with SourceBufferRemoveError on remove error event", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    const resultPromise = runEither(
      SourceBufferModule.removeBuffer(sourceBuffer.asSourceBuffer(), { start: 1, end: 3 }),
    );

    await waitForListener(sourceBuffer, "error");
    sourceBuffer.dispatch("error");
    const result = await resultPromise;

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(SourceBufferModule.SourceBufferRemoveError);
    }
    expect(sourceBuffer.listenerCount("updateend")).toBe(0);
    expect(sourceBuffer.listenerCount("error")).toBe(0);
  });

  test("fails with SourceBufferRemoveError when remove throws", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    sourceBuffer.throwOnRemove = true;

    const result = await runEither(
      SourceBufferModule.removeBuffer(sourceBuffer.asSourceBuffer(), { start: 1, end: 3 }),
    );

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(SourceBufferModule.SourceBufferRemoveError);
    }
    expect(sourceBuffer.listenerCount("updateend")).toBe(0);
    expect(sourceBuffer.listenerCount("error")).toBe(0);
  });
});

describe("SourceBufferModule.cleanupOldBuffer", () => {
  test("removes only ranges older than the retain-behind window", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    sourceBuffer.buffered = makeTimeRanges([
      [0, 4],
      [5, 10],
      [20, 30],
      [40, 50],
    ]);
    sourceBuffer.autoDispatchUpdateEndOnRemove = true;

    const removedRanges = await Effect.runPromise(
      SourceBufferModule.cleanupOldBuffer(sourceBuffer.asSourceBuffer(), {
        currentRange: TimeRange.fromRaw({ start: 5, end: 25 }),
        currentTime: 20,
      }),
    );

    expect(sourceBuffer.removedRanges).toEqual([
      { start: 0, end: 4 },
      { start: 5, end: 10 },
    ]);
    expect(removedRanges).toEqual(sourceBuffer.removedRanges.map(TimeRange.fromRaw));
  });

  test("preserves future buffered ranges", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    sourceBuffer.buffered = makeTimeRanges([
      [12, 30],
      [40, 50],
    ]);
    sourceBuffer.autoDispatchUpdateEndOnRemove = true;

    const removedRanges = await Effect.runPromise(
      SourceBufferModule.cleanupOldBuffer(sourceBuffer.asSourceBuffer(), {
        currentRange: TimeRange.fromRaw({ start: 12, end: 30 }),
        currentTime: 20,
      }),
    );

    expect(sourceBuffer.removedRanges).toEqual([]);
    expect(removedRanges).toEqual([]);
  });

  test("respects a custom retain-behind window", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    sourceBuffer.buffered = makeTimeRanges([[0, 18]]);
    sourceBuffer.autoDispatchUpdateEndOnRemove = true;

    const removedRanges = await Effect.runPromise(
      SourceBufferModule.cleanupOldBuffer(sourceBuffer.asSourceBuffer(), {
        currentRange: TimeRange.fromRaw({ start: 0, end: 30 }),
        currentTime: 20,
        retainBehindSeconds: 5,
      }),
    );

    expect(sourceBuffer.removedRanges).toEqual([{ start: 0, end: 15 }]);
    expect(removedRanges).toEqual(sourceBuffer.removedRanges.map(TimeRange.fromRaw));
  });
});

describe("SourceBufferModule.clearSourceBuffer", () => {
  test("does nothing when there are no buffered ranges", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    sourceBuffer.buffered = makeTimeRanges([]);

    await Effect.runPromise(SourceBufferModule.clearSourceBuffer(sourceBuffer.asSourceBuffer()));

    expect(sourceBuffer.removedRanges).toEqual([]);
  });

  test("removes from zero through the end of the last buffered range", async () => {
    const sourceBuffer = new FakeSourceBuffer();
    sourceBuffer.buffered = makeTimeRanges([
      [5, 10],
      [20, 30],
    ]);
    sourceBuffer.autoDispatchUpdateEndOnRemove = true;

    await Effect.runPromise(SourceBufferModule.clearSourceBuffer(sourceBuffer.asSourceBuffer()));

    expect(sourceBuffer.removedRanges).toEqual([{ start: 0, end: 30 }]);
  });
});
