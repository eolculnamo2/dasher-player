import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/core/segment_fetched_queue/segment_fetched_queue";
import { SegmentScheduler } from "@/src/core/segment_scheduler/segment_scheduler";
import type { SegmentPendingQueues } from "@/src/core/segment_pending_queues/segment_pending_queues";
import { Effect, Ref } from "effect";
import { BufferBasedAbr } from "@/src/abr/buffer_based/buffer_based_abr";
import type { Hysteresis } from "@/src/abr/hysteresis/hysteresis";
import type { SegmentOrder } from "@/src/core/segment_order/segment_order";

export namespace TickOrchestrator {
  type Params = {
    buffer: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueues.Type;
    scheduler: SegmentScheduler.Type;
    currentPlaylist: Ref.Ref<DashManifest.Playlist>;
    hysteresis: Ref.Ref<Hysteresis.Type>;
    manifest: DashManifest.Type;
    cancelCurrentSegmentFetches: Effect.Effect<void>;
    restartSegmentFetchWorker: Effect.Effect<void>;
    lastAppendedSegment: Ref.Ref<SegmentOrder.Type>;
  };
  export const make = ({
    manifest,
    buffer,
    mediaElement,
    segmentFetchedQueue,
    segmentPendingQueue,
    currentPlaylist,
    hysteresis,
    scheduler,
    cancelCurrentSegmentFetches,
    restartSegmentFetchWorker,
    lastAppendedSegment,
  }: Params) =>
    Effect.gen(function* () {
      if ((yield* segmentFetchedQueue.queue.size) > 0) {
        const playlistBefore = yield* Ref.get(currentPlaylist);
        const nextPlaylist = yield* BufferBasedAbr.nextRepresentation({
          bufferManager: buffer,
          manifest,
          mediaElement,
          currentPlaylist,
          hysteresis,
        });
        if (DashManifest.arePlaylistsDistinct(nextPlaylist, playlistBefore)) {
          // todo move this into policy
          yield* Effect.logInfo(
            "distinct representation; clearing previous playlist scheduling state",
          );
          const videoBuffer = BufferManager.findFirstVideoBuffer(buffer);
          if (!videoBuffer) {
            throw new Error("Invariant violation: Unable to find video buffer for ABR switch");
          }
          yield* Ref.update(currentPlaylist, () => nextPlaylist);
          yield* cancelCurrentSegmentFetches;
          yield* SegmentFetchedQueue.clear(segmentFetchedQueue);
          scheduler.fetchMap.clear();
          yield* BufferManager.clearVideoBuffer(buffer);
          yield* BufferManager.addInit(buffer, {
            playlist: nextPlaylist,
            sourceBuffer: videoBuffer,
          });
          yield* restartSegmentFetchWorker;
        }
      }

      yield* BufferManager.flushSegmentQueue(
        buffer,
        segmentFetchedQueue,
        currentPlaylist,
        lastAppendedSegment,
      );

      const bufferBehindMap = BufferManager.bufferBehindTargetByCodec(
        buffer,
        mediaElement.currentTime,
      );

      yield* SegmentScheduler.tick(scheduler, {
        buffer,
        manifest,
        currentPlaylist,
        segmentPendingQueue,
        requested: bufferBehindMap,
      });
    });
}
