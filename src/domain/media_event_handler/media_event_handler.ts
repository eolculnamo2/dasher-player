import { Effect } from "effect";
import { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueues } from "../segment_pending_queues/segment_pending_queues";
import { SegmentScheduler } from "../segment_scheduler/segment_scheduler";

export namespace MediaEventHandler {
  type Params = {
    mediaElement: HTMLMediaElement;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueues.Type;
    scheduler: SegmentScheduler.Type;
    cancelCurrentSegmentFetches: Effect.Effect<void>;
    restartSegmentFetchWorker: Effect.Effect<void>;
  };

  export const subscribe = ({
    mediaElement,
    segmentFetchedQueue,
    segmentPendingQueue,
    scheduler,
    cancelCurrentSegmentFetches,
    restartSegmentFetchWorker,
  }: Params) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const onSeeking = () => {
          Effect.runFork(
            Effect.gen(function* () {
              yield* cancelCurrentSegmentFetches;
              yield* Effect.all([
                SegmentFetchedQueue.clear(segmentFetchedQueue),
                SegmentPendingQueues.clear(segmentPendingQueue),
                SegmentScheduler.clear(scheduler),
              ]);
              yield* restartSegmentFetchWorker;
            }),
          );
        };

        mediaElement.addEventListener("seeking", onSeeking);
        return onSeeking;
      }),
      (onSeeking) =>
        Effect.sync(() => {
          mediaElement.removeEventListener("seeking", onSeeking);
        }),
    ).pipe(Effect.asVoid);
}
