import { describe, expect, test } from "bun:test";
import { HttpClient, HttpClientError } from "@effect/platform";
import type { HttpClientResponse } from "@effect/platform/HttpClientResponse";
import { Duration, Effect, Either, Fiber, TestClock, TestContext } from "effect";
import type { ManifestUrl } from "@/src/domain/manifest_url/manifest_url";
import { ManifestFetcher } from "@/src/fetchers/manifest_fetcher/manifest_fetcher";

const url = "https://example.com/manifest.mpd" as ManifestUrl.T;

const makeResponse = (body: string, status = 200): HttpClientResponse =>
  ({
    status,
    text: Effect.succeed(body),
  }) as unknown as HttpClientResponse;

const makeRequestError = (cause: unknown) =>
  new HttpClientError.RequestError({
    request: {} as never,
    reason: "Transport",
    cause,
  });

const makeClient = (get: HttpClient.HttpClient["get"]): HttpClient.HttpClient =>
  ({
    get,
  }) as unknown as HttpClient.HttpClient;

const fetchWithClient = (client: HttpClient.HttpClient) =>
  ManifestFetcher.fetch(url).pipe(Effect.provideService(HttpClient.HttpClient, client));

const runEither = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(Effect.either(effect));

const runTestClockEither = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.either(effect).pipe(Effect.fork);
      yield* Effect.yieldNow();
      yield* TestClock.adjust(Duration.seconds(20));
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestContext.TestContext)),
  );

describe("ManifestFetcher.fetch", () => {
  test("GETs the manifest URL and returns the response text", async () => {
    const requestedUrls: Array<string | URL> = [];
    const client = makeClient((requestUrl) =>
      Effect.suspend(() => {
        requestedUrls.push(requestUrl);
        return Effect.succeed(makeResponse("manifest-body"));
      }),
    );

    const result = await Effect.runPromise(fetchWithClient(client));

    expect(result).toBe("manifest-body");
    expect(requestedUrls).toEqual([url]);
  });

  test("retries retryable response statuses and eventually returns the body", async () => {
    let attempts = 0;
    const client = makeClient(() =>
      Effect.suspend(() => {
        attempts += 1;

        if (attempts < 4) {
          return Effect.succeed(makeResponse("too many requests", 429));
        }

        return Effect.succeed(makeResponse("manifest-after-retry"));
      }),
    );

    const result = await runTestClockEither(fetchWithClient(client));

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("manifest-after-retry");
    }
    expect(attempts).toBe(4);
  });

  test("continues retrying retryable response statuses until a request succeeds", async () => {
    let attempts = 0;
    const client = makeClient(() =>
      Effect.suspend(() => {
        attempts += 1;

        if (attempts < 5) {
          return Effect.succeed(makeResponse("service unavailable", 503));
        }

        return Effect.succeed(makeResponse("manifest-after-503s"));
      }),
    );

    const result = await runTestClockEither(fetchWithClient(client));

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("manifest-after-503s");
    }
    expect(attempts).toBe(5);
  });

  test("fails with NonRetryableManifestError for non-retryable response statuses and does not retry", async () => {
    let attempts = 0;
    const client = makeClient(() =>
      Effect.suspend(() => {
        attempts += 1;
        return Effect.succeed(makeResponse("not found", 404));
      }),
    );

    const result = await runEither(fetchWithClient(client));

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      const error = result.left;
      expect(error).toBeInstanceOf(ManifestFetcher.NonRetryableManifestError);
      if (error instanceof ManifestFetcher.NonRetryableManifestError) {
        expect(error.url).toBe(url);
        expect(error.status).toBe(404);
      }
    }
    expect(attempts).toBe(1);
  });

  test("retries non-response HttpClient errors until a request succeeds", async () => {
    const cause = new Error("network down");
    const requestError = makeRequestError(cause);
    let attempts = 0;
    const client = makeClient(() =>
      Effect.suspend(() => {
        attempts += 1;

        if (attempts < 3) {
          return Effect.fail(requestError);
        }

        return Effect.succeed(makeResponse("manifest-after-network-errors"));
      }),
    );

    const result = await runTestClockEither(fetchWithClient(client));

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("manifest-after-network-errors");
    }
    expect(attempts).toBe(3);
  });

  test("retries after a manifest request timeout and returns when a later attempt completes", async () => {
    let attempts = 0;
    const client = makeClient(() =>
      Effect.suspend(() => {
        attempts += 1;

        if (attempts === 1) {
          return Effect.never;
        }

        return Effect.succeed(makeResponse("manifest-after-timeout"));
      }),
    );

    const result = await runTestClockEither(fetchWithClient(client));

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("manifest-after-timeout");
    }
    expect(attempts).toBe(2);
  });

  test("returns the response body for 3xx response statuses", async () => {
    const client = makeClient(() => Effect.succeed(makeResponse("redirect", 302)));

    const result = await runEither(fetchWithClient(client));

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right).toBe("redirect");
    }
  });
});
