import { Data, Duration, Effect, Schedule } from "effect";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import type { ManifestUrl } from "@/src/domain/manifest_url/manifest_url";

export namespace ManifestFetcher {
  export class RetryableManifestError extends Data.TaggedError("RetryableManifestError")<{
    url: ManifestUrl.T;
    status: number;
  }> {}

  export class NonRetryableManifestError extends Data.TaggedError("NonRetryableManifestError")<{
    url: ManifestUrl.T;
    status: number;
  }> {}

  export class ManifestTimeoutError extends Data.TaggedError("ManifestTimeoutError")<{
    url: ManifestUrl.T;
    timeoutMs: number;
  }> {}

  const DEFAULT_MANIFEST_TIMEOUT = Duration.seconds(10);
  export const fetch = (url: ManifestUrl.T) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const response = yield* client.get(url).pipe(
        failOnErrorCodes(url),
        Effect.timeoutFail({
          duration: DEFAULT_MANIFEST_TIMEOUT,
          onTimeout: () =>
            new ManifestTimeoutError({
              url,
              timeoutMs: Duration.toMillis(DEFAULT_MANIFEST_TIMEOUT),
            }),
        }),
        Effect.retry({
          while: (error) => error._tag === "RetryableManifestError",
          schedule: Schedule.exponential(Duration.millis(250)).pipe(
            Schedule.compose(Schedule.recurs(3)),
          ),
        }),
      );
      return yield* response.text;
    });

  const failOnErrorCodes = (url: ManifestUrl.T) =>
    Effect.flatMap((response: HttpClientResponse.HttpClientResponse) =>
      response.status >= 200 && response.status < 399
        ? Effect.succeed(response)
        : Effect.fail(classifyError(url, response.status)),
    );

  const classifyError = (url: ManifestUrl.T, status: number) => {
    if (status === 408 || status === 425 || status === 429 || status >= 500) {
      return new RetryableManifestError({ url, status });
    }
    return new NonRetryableManifestError({ url, status });
  };
}
