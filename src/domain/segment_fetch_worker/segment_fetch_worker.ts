import { Duration, Effect, Queue } from "effect";
import type { SegmentPendingQueue } from "../segmnet_pending_queue/segment_pending_queue";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";
import { floorToNearest100 } from "@/src/utils/round";

// opportunities:
// - differentiate between codec to see how much of each needs caught up (could prioritize by codec, and may queue per codec)i
// - factor in how far ahead buffer is of current time (can eventually factor in network quality)
// - and remember that simplicity is the cost we pay as we add more sophistication
export namespace SegmentFetchWorker {
  type SubscribeParams = {
    segmentPendingQueue: SegmentPendingQueue.Type;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    lifetimeTick: Duration.Duration;
    currentTime: number;
  };
  export const subscribe = ({
    segmentFetchedQueue,
    segmentPendingQueue,
    lifetimeTick,
    currentTime,
  }: SubscribeParams) =>
    Effect.gen(function* () {
      if ((floorToNearest100(lifetimeTick) % 1000) !== 0) {
        return;
      }
      const chunks = yield* Queue.takeUpTo(segmentPendingQueue.queue, 3);
      for (const pending of chunks) {
        if (pending.segment.resolvedUri == null) {
          Effect.logWarning(`skipping segment with missing resolvedUri`)
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
    });

    // todo soon
    const getMaxSegments = () => {}
}
