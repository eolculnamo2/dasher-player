import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import type { SegmentFetchedQueue } from "@/src/core/segment_fetched_queue/segment_fetched_queue";
import { SegmentScheduler } from "@/src/core/segment_scheduler/segment_scheduler";
import type { SegmentPendingQueues } from "@/src/core/segment_pending_queues/segment_pending_queues";
import { Effect, Ref } from "effect";
import { BufferBasedAbr } from "@/src/abr/buffer_based/buffer_based_abr";
import type { Hysteresis } from "@/src/abr/hysteresis/hysteresis";

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
  }: Params) =>
    Effect.gen(function* () {
      const currentTime = mediaElement.currentTime;

      // ABR on segment fetch
      if ((yield* segmentFetchedQueue.queue.size) > 0) {
        yield* BufferBasedAbr.nextRepresentation({
          bufferManager: buffer,
          manifest,
          mediaElement,
          currentPlaylist,
          hysteresis,
        });
      }

      yield* BufferManager.flushSegmentQueue(buffer, buffer.buffers.keys(), segmentFetchedQueue);

      const bufferBehindMap = BufferManager.bufferBehindTargetByCodec(buffer, currentTime);

      yield* SegmentScheduler.tick(scheduler, {
        manifest,
        currentPlaylist,
        segmentPendingQueue,
        requested: bufferBehindMap,
        currentTime,
      });
    });
}
