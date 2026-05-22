// tuning should lean aggressive. If a segment isn't working, we'll just grab another one off the ABR ladder

import { Cause, Data, Duration, Effect, Schedule } from "effect";
import { HttpClient, HttpClientError, HttpClientResponse } from "@effect/platform";
import type { SegmentUrl } from "@/src/core/segment_url/segment_url";
import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import type { BufferZone } from "@/src/core/buffer_zone/buffer_zone";
import { clamp } from "@/src/utils/clamp";

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

  export class RequestCancelledCalled extends Data.TaggedError("RequestCancelledCalled")<{
    url: string;
  }> {}

  export type SegmentError =
    | HttpClientError.HttpClientError
    | RetryableSegmentError
    | NonRetryableSegmentError
    | SegmentTimeoutError
    | RequestCancelledCalled;

  const DEFAULT_SEGMENT_TIMEOUT = Duration.seconds(5);
  export type FetchParams =
    | {
        segment: DashManifest.DashSegment;
        playlist: DashManifest.Playlist | null;
        bufferZone: BufferZone.Type | null;
      }
    | string;
  export const fetch = (params: FetchParams) =>
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient;
      const url = typeof params === "string" ? params : params.segment.resolvedUri;

      return yield* Effect.gen(function* () {
        const response = yield* client.get(url).pipe(
          failOnErrorCodes(url),
          Effect.timeoutFail({
            duration:
              typeof params !== "string" && params.playlist && params.bufferZone
                ? timeoutPolicy({ playlist: params.playlist, bufferZone: params.bufferZone })
                : DEFAULT_SEGMENT_TIMEOUT,
            onTimeout: () =>
              new SegmentTimeoutError({
                url,
                timeoutMs: Duration.toMillis(DEFAULT_SEGMENT_TIMEOUT),
              }),
          }),
          Effect.retry({
            while: (error) => error._tag !== "NonRetryableSegmentError",
            schedule: Schedule.exponential(Duration.millis(100)).pipe(
              Schedule.union(Schedule.spaced(Duration.seconds(5))),
              Schedule.compose(Schedule.forever),
              Schedule.jittered,
            ),
          }),
        );
        return yield* response.arrayBuffer;
      }).pipe(
        Effect.catchAllCause((cause) =>
          Cause.isInterrupted(cause)
            ? Effect.fail<SegmentError>(new RequestCancelledCalled({ url }))
            : Effect.failCause(cause),
        ),
      );
    });

  type TimeoutPolicy = (params: {
    playlist: DashManifest.Playlist;
    bufferZone: BufferZone.Type;
  }) => Duration.Duration;
  const timeoutPolicy: TimeoutPolicy = ({ playlist, bufferZone }) => {
    // assume VBR and be conservative
    const bandwidth = playlist.attributes.BANDWIDTH;
    switch (bufferZone) {
      case "healthy":
        return Duration.seconds(
          clamp({
            min: 6_000,
            max: 12_000,
            value: bandwidth / 100_000,
          }),
        );
      case "reservoir":
        return Duration.seconds(
          clamp({
            min: 4_000,
            max: 10_000,
            value: bandwidth / 120_000,
          }),
        );
      case "caution":
        return Duration.seconds(
          clamp({
            min: 4_000,
            max: 6_000,
            value: bandwidth / 130_000,
          }),
        );
      case "critical":
        return Duration.seconds(
          clamp({
            min: 4_000,
            max: 4_000,
            value: bandwidth / 150_000,
          }),
        );
    }
  };

  const failOnErrorCodes = (url: SegmentUrl.Type) =>
    Effect.flatMap((response: HttpClientResponse.HttpClientResponse) =>
      response.status >= 200 && response.status < 399
        ? Effect.succeed(response)
        : Effect.fail(classifyError(url, response.status)),
    );

  const classifyError = (url: string, status: number) => {
    if (status === 408 || status === 425 || status === 429 || status === 504) {
      return new RetryableSegmentError({ url, status });
    }
    return new NonRetryableSegmentError({ url, status });
  };
}
