import { describe, expect, test } from "bun:test";
import { Duration, Effect, Fiber, Logger, TestClock, TestContext } from "effect";
import { logIfSlow } from "./log_if_slow";

type LogEntry = {
  level: string;
  message: unknown;
};

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

describe("logIfSlow", () => {
  test("returns the effect result", async () => {
    const logs: Array<LogEntry> = [];

    const result = await runWithTestClockAndLogger(
      logIfSlow(Effect.succeed("done"), "fast task", Duration.seconds(1)),
      logs,
    );

    expect(result).toBe("done");
  });

  test("does not log when the effect completes before the threshold", async () => {
    const logs: Array<LogEntry> = [];

    const result = await runWithTestClockAndLogger(
      Effect.gen(function* () {
        const fiber = yield* logIfSlow(
          Effect.succeed("done"),
          "fast task",
          Duration.seconds(1),
        ).pipe(Effect.fork);

        const value = yield* Fiber.join(fiber);
        yield* TestClock.adjust(Duration.seconds(1));
        yield* Effect.yieldNow();

        return value;
      }),
      logs,
    );

    expect(result).toBe("done");
    expect(logs).toEqual([]);
  });

  test("logs a warning when the effect is still running after the threshold", async () => {
    const logs: Array<LogEntry> = [];

    const result = await runWithTestClockAndLogger(
      Effect.gen(function* () {
        const fiber = yield* logIfSlow(
          Effect.sleep(Duration.seconds(2)).pipe(Effect.as("done")),
          "slow task",
          Duration.seconds(1),
        ).pipe(Effect.fork);

        yield* TestClock.adjust(Duration.seconds(1));
        yield* Effect.yieldNow();
        yield* TestClock.adjust(Duration.seconds(1));

        return yield* Fiber.join(fiber);
      }),
      logs,
    );

    expect(result).toBe("done");
    expect(logs).toEqual([{ level: "WARN", message: ["slow task is taking a while..."] }]);
  });
});
