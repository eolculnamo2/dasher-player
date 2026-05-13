import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import type { SegmentFetchedQueue } from "@/src/domain/segment_fetched_queue/segment_fetched_queue";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import type { SegmentPendingQueues } from "@/src/domain/segment_pending_queues/segment_pending_queues";
import { Effect } from "effect";

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
    Effect.gen(function* () {
      const currentTime = mediaElement.currentTime;

      yield* BufferManager.flushSegmentQueue(buffer, buffer.buffers.keys(), segmentFetchedQueue);
      console.log(
        buffer.buffers.entries().forEach(([k, b]) => {
          if (b.buffered.length > 0) {
            console.log(k, b.buffered.end(0) - b.buffered.start(0));
          }
        }),
      );

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
