// tuning should lean aggressive. If a segment isn't working, we'll just grab another one off the ABR ladder

import { Data, Duration, Effect, Schedule } from "effect";
import { HttpClient, HttpClientResponse } from "@effect/platform";
import type { SegmentUrl } from "@/src/domain/segment_url/segment_url";

export namespace SegmentFetcher {
  export class RetryableSegmentError extends Data.TaggedError("RetryableSegmentError")<{
    url: string;
    status: number;
  }> {}

  export class NonRetryableSegmentError extends Data.TaggedError("NonRetryableSegmentError")<{
    url: string;
    status: number;
  }> {}

  export class SegmentTimeoutError extends Data.TaggedError("SegmentTimeoutError")<{
    url: string;
    timeoutMs: number;
  }> {}

  export type SegmentError = RetryableSegmentError | NonRetryableSegmentError | SegmentTimeoutError;

  const DEFAULT_SEGMENT_TIMEOUT = Duration.seconds(5);
  export const fetch = (url: SegmentUrl.Type) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;

      const response = yield* client.get(url).pipe(
        failOnErrorCodes(url),
        Effect.timeoutFail({
          duration: DEFAULT_SEGMENT_TIMEOUT,
          onTimeout: () =>
            new SegmentTimeoutError({
              url,
              timeoutMs: Duration.toMillis(DEFAULT_SEGMENT_TIMEOUT),
            }),
        }),
        Effect.retry({
          while: (error) => error._tag === "RetryableSegmentError",
          schedule: Schedule.exponential(Duration.millis(100)).pipe(
            Schedule.compose(Schedule.recurs(2)),
          ),
        }),
      );
      // this isn't correct
      return yield* response.arrayBuffer;
    });

  const failOnErrorCodes = (url: SegmentUrl.Type) =>
    Effect.flatMap((response: HttpClientResponse.HttpClientResponse) =>
      response.status >= 200 && response.status < 399
        ? Effect.succeed(response)
        : Effect.fail(classifyError(url, response.status)),
    );

  const classifyError = (url: string, status: number) => {
    if (status === 408 || status === 425 || status === 429 || status >= 500) {
      return new RetryableSegmentError({ url, status });
    }
    return new NonRetryableSegmentError({ url, status });
  };
}
