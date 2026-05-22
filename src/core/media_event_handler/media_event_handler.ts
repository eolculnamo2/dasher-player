import { Effect, Ref } from "effect";
import { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueues } from "../segment_pending_queues/segment_pending_queues";
import { SegmentScheduler } from "../segment_scheduler/segment_scheduler";
import type { SegmentOrder } from "../segment_order/segment_order";
import { BufferManager } from "../buffer_manager/buffer_manager";

export namespace MediaEventHandler {
  type Params = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueues.Type;
    scheduler: SegmentScheduler.Type;
    cancelCurrentSegmentFetches: Effect.Effect<void>;
    restartSegmentFetchWorker: Effect.Effect<void>;
    lastAppendedSegment: Ref.Ref<SegmentOrder.Type>;
  };

  // fix this on seek next
  export const subscribe = ({
    bufferManager,
    mediaElement,
    segmentFetchedQueue,
    segmentPendingQueue,
    scheduler,
    cancelCurrentSegmentFetches,
    restartSegmentFetchWorker,
    lastAppendedSegment,
  }: Params) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const onSeeking = () => {
          Effect.runFork(
            Effect.gen(function* () {
              // TODO: make this smarter so that if we seek into a region that's already in buffer, we don't clear and refetch.
              // also need to test with generic, programatic time changes such as jump forward or backward 5 secs that a player UI might implement
              const videoBuffer = BufferManager.findFirstVideoBuffer(bufferManager);
              if (!videoBuffer) {
                return yield* Effect.logError(
                  "Invariant violation: Unable to find video buffer for ABR switch",
                );
              }
              yield* cancelCurrentSegmentFetches;
              yield* Effect.all([
                SegmentFetchedQueue.clear(segmentFetchedQueue),
                SegmentPendingQueues.clear(segmentPendingQueue),
                SegmentScheduler.clear(scheduler),
                Ref.set(lastAppendedSegment, new Map()),
                BufferManager.clearVideoBuffer(bufferManager),
                BufferManager.clearAudioBuffer(bufferManager),
                restartSegmentFetchWorker,
              ]);
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
