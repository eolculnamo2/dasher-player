import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/core/segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueues } from "@/src/core/segment_pending_queues/segment_pending_queues";
import type { SegmentOrder } from "@/src/core/segment_order/segment_order";
import { SegmentScheduler } from "@/src/core/segment_scheduler/segment_scheduler";
import { Effect, Ref } from "effect";

export namespace ResetBufferProcess {
  export type ResetParams = {
    currentPlaylist: Ref.Ref<DashManifest.Playlist>;
    nextPlaylist: DashManifest.Playlist;
    bufferManager: BufferManager.Type;
    scheduler: SegmentScheduler.Type;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueues.Type;
    lastAppendedSegment: Ref.Ref<SegmentOrder.Type>;
    cancelCurrentSegmentFetches: Effect.Effect<void>;
    restartSegmentFetchWorker: Effect.Effect<void>;
  };
  export const reset = ({
    bufferManager,
    currentPlaylist,
    scheduler,
    nextPlaylist,
    segmentFetchedQueue,
    segmentPendingQueue,
    lastAppendedSegment,
    restartSegmentFetchWorker,
    cancelCurrentSegmentFetches,
  }: ResetParams) =>
    Effect.gen(function* () {
      const videoBuffer = BufferManager.findFirstVideoBuffer(bufferManager);
      if (!videoBuffer) {
        return yield* Effect.logError(
          "Invariant violation: Unable to find video buffer for ABR switch",
        );
      }
      yield* Effect.all(
        [
          cancelCurrentSegmentFetches,
          SegmentFetchedQueue.clear(segmentFetchedQueue),
          SegmentPendingQueues.clear(segmentPendingQueue),
          SegmentScheduler.clear(scheduler),
          Ref.set(lastAppendedSegment, new Map()),
          Ref.update(currentPlaylist, () => nextPlaylist),
          BufferManager.clearVideoBuffer(bufferManager),
          BufferManager.clearAudioBuffer(bufferManager),
          BufferManager.addInit(bufferManager, {
            playlist: nextPlaylist,
            sourceBuffer: videoBuffer,
          }),
          restartSegmentFetchWorker,
        ],
        {
          concurrency: 1,
        },
      );
    });
}
