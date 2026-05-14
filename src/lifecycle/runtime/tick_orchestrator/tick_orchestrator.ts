import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import type { SegmentFetchedQueue } from "@/src/domain/segment_fetched_queue/segment_fetched_queue";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import type { SegmentPendingQueues } from "@/src/domain/segment_pending_queues/segment_pending_queues";
import { Effect } from "effect";
import { BufferZone } from "@/src/domain/buffer_zone/buffer_zone";

export namespace TickOrchestrator {
  type Params = {
    buffer: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueues.Type;
    scheduler: SegmentScheduler.Type;
    recommendedPlaylist: DashManifest.Playlist;
    manifest: DashManifest.Type;
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
      const bufferZone = BufferZone.get({
        bufferManager: buffer,
        manifest,
        mediaElement,
      })

      // will remove log later. Will leave or turn into debug while building out ABR behavior
      yield* Effect.logInfo('buffer zone', bufferZone);

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
