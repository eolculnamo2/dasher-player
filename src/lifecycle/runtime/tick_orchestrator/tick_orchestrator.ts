import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/core/segment_fetched_queue/segment_fetched_queue";
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
    cancelCurrentSegmentFetches: Effect.Effect<void>;
    restartSegmentFetchWorker: Effect.Effect<void>;
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
  }: Params) =>
    Effect.gen(function* () {
      const currentTime = mediaElement.currentTime;
      const playlistBefore = yield* Ref.get(currentPlaylist);

      // ABR on segment fetch
      // still identifying things that have to happen when ABR switches.
      // Domain-wise, there is overlap between ABR switch and normal representation switch.
      // Representation switch is probably its own module; ABR either composes it, or passes data to it after
      // We also still have problems to work through. When we cancel segment requests, we don't reschedule them at the new ABR option, AND
      // we don't currently allow them to finish. Policies need to be developed around this to make this work well (Preferably with multiple options).
      // definitely have work cut out to make this working and sane -- ideally elegant. Lesson learned - I should not have combined representation switch work with ABR

      if ((yield* segmentFetchedQueue.queue.size) > 0) {
        const nextPlaylist = yield* BufferBasedAbr.nextRepresentation({
          bufferManager: buffer,
          segmentFetchedQueue,
          manifest,
          mediaElement,
          currentPlaylist,
          hysteresis,
        });
        if (DashManifest.arePlaylistsDistinct(nextPlaylist, playlistBefore)) {
          yield* Ref.update(currentPlaylist, () => nextPlaylist);
          yield* cancelCurrentSegmentFetches;
          yield* restartSegmentFetchWorker;
        }
      }

      yield* BufferManager.flushSegmentQueue(
        buffer,
        buffer.buffers.keys(),
        segmentFetchedQueue,
        currentPlaylist,
      );

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
