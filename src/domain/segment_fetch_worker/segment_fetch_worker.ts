import { Chunk, Duration, Effect, Queue } from "effect";
import type { SegmentPendingQueue } from "../segmnet_pending_queue/segment_pending_queue";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";
import { BufferManager } from "../buffer_manager/buffer_manager";

// opportunities:
// - differentiate between codec to see how much of each needs caught up (could prioritize by codec, and may queue per codec)i
// - can eventually factor in network quality
// - and remember that simplicity is the cost we pay as we add more sophistication
export namespace SegmentFetchWorker {
  const DEFAULT_MAX_SEGMENTS_PER_TICK = 3;
  const DEFAULT_FETCH_WORKER_SLEEP = Duration.seconds(1);
  const SKIP_SLEEP_BUFFER_THRESHOLD = Duration.seconds(10);
  const SINGLE_SEGMENT_BUFFER_THRESHOLD = Duration.seconds(20);

  type SubscribeParams = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    segmentPendingQueue: SegmentPendingQueue.Type;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
  };

  const shouldSleep = (bufferRunway: Duration.Duration) =>
    Duration.toMillis(bufferRunway) >= Duration.toMillis(SKIP_SLEEP_BUFFER_THRESHOLD);

  const getMaxSegmentsPerLoop = (bufferRunway: Duration.Duration) =>
    Duration.toMillis(bufferRunway) > Duration.toMillis(SINGLE_SEGMENT_BUFFER_THRESHOLD)
      ? 1
      : DEFAULT_MAX_SEGMENTS_PER_TICK;

  const sleepIfNeeded = (bufferRunway: Duration.Duration) =>
    shouldSleep(bufferRunway) ? Effect.sleep(DEFAULT_FETCH_WORKER_SLEEP) : Effect.void;

  export const subscribe = ({
    bufferManager,
    mediaElement,
    segmentFetchedQueue,
    segmentPendingQueue,
  }: SubscribeParams) =>
    Effect.forever(
      Effect.gen(function* () {
        const first = yield* Queue.take(segmentPendingQueue.queue);
        const bufferRunway = BufferManager.getBufferRunway(bufferManager, mediaElement.currentTime);
        const maxSegmentsPerLoop = getMaxSegmentsPerLoop(bufferRunway);
        const rest = yield* Queue.takeUpTo(segmentPendingQueue.queue, maxSegmentsPerLoop - 1);

        for (const pending of [first, ...Chunk.toArray(rest)]) {
          if (pending.segment.resolvedUri == null) {
            yield* Effect.logWarning(`skipping segment with missing resolvedUri`);
            continue;
          }
          yield* SegmentFetcher.fetch(pending.segment.resolvedUri).pipe(
            Effect.flatMap((data) =>
              SegmentFetchedQueue.add(segmentFetchedQueue, {
                data,
                segment: pending.segment,
                mimeType: pending.mimeType,
              }),
            ),
          );
        }

        yield* sleepIfNeeded(bufferRunway);
      }),
    );
}
