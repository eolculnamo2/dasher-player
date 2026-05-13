import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import { SegmentFetchWorker } from "@/src/domain/segment_fetch_worker/segment_fetch_worker";
import type { SegmentFetchedQueue } from "@/src/domain/segment_fetched_queue/segment_fetched_queue";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import type { SegmentPendingQueue } from "@/src/domain/segmnet_pending_queue/segment_pending_queue";
import { Duration, Effect } from "effect";

export namespace TickOrchestrator {
  type Params = {
    buffer: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueue.Type;
    scheduler: SegmentScheduler.Type;
    recommendedPlaylist: DashManifest.Playlist;
    manifest: DashManifest.Type;
    lifetimeTick: Duration.Duration;
  };
  export const make = ({
    manifest,
    buffer,
    mediaElement,
    segmentFetchedQueue,
    segmentPendingQueue,
    recommendedPlaylist,
    scheduler,
  }: Params) =>
    Effect.gen(function*() {
      const currentTime = mediaElement.currentTime;

      yield* BufferManager.flushSegmentQueue(buffer, buffer.buffers.keys(), segmentFetchedQueue);

      const bufferBehindMap = BufferManager.bufferBehindTargetByCodec(buffer, currentTime);

      yield* SegmentScheduler.tick(scheduler, {
        manifest,
        recommendedPlaylist,
        segmentPendingQueue,
        requested: bufferBehindMap,
        currentTime,
      });
    });
}
