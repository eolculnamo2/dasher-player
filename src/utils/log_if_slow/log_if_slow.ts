import { Duration, Fiber, Effect } from "effect";

export const logIfSlow = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  label: string,
  threshold: Duration.DurationInput,
): Effect.Effect<A, E, R> =>
  Effect.gen(function* () {
    const fiber = yield* Effect.fork(effect);

    // watchdog
    yield* Effect.fork(
      Effect.sleep(threshold).pipe(
        Effect.zipRight(Fiber.status(fiber)),
        Effect.flatMap((status) =>
          status._tag === "Done" ? Effect.void : Effect.logWarning(`${label} is taking a while...`),
        ),
      ),
    );

    return yield* Fiber.join(fiber);
  });
