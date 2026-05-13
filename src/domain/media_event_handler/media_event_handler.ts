import { Effect } from "effect";
import { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueue } from "../segmnet_pending_queue/segment_pending_queue";
import { SegmentScheduler } from "../segment_scheduler/segment_scheduler";

export namespace MediaEventHandler {
  type Params = {
    mediaElement: HTMLMediaElement;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueue.Type;
    scheduler: SegmentScheduler.Type;
  };

  export const subscribe = ({
    mediaElement,
    segmentFetchedQueue,
    segmentPendingQueue,
    scheduler,
  }: Params) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const onSeeking = () => {
          Effect.runFork(
            Effect.all([
              SegmentFetchedQueue.clear(segmentFetchedQueue),
              SegmentPendingQueue.clear(segmentPendingQueue),
              SegmentScheduler.clear(scheduler),
            ]),
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
