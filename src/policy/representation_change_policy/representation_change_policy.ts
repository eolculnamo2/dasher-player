// On representation change, we must:
// 1a) Schedule new init segment to come before scheduled segments at current representation, but not before currently scheduled segments
// 1b) Optionally clear the buffer and have newly scheduled segments start at segment beginning boundary of current time (introduces rebuffer)
// 1c) Optionally clear the buffer AFTER the end of current segment and start init + new segments there

import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/core/segment_fetched_queue/segment_fetched_queue";
import type { SegmentScheduler } from "@/src/core/segment_scheduler/segment_scheduler";
import { Effect, Ref } from "effect";

export namespace RepresentationChangePolicy {
  export type ChangeParams = {
    currentPlaylist: Ref.Ref<DashManifest.Playlist>;
    nextPlaylist: DashManifest.Playlist;
    bufferManager: BufferManager.Type;
    scheduler: SegmentScheduler.Type;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    cancelCurrentSegmentFetches: Effect.Effect<void>;
    restartSegmentFetchWorker: Effect.Effect<void>;
  };
  export const handleChange = ({
    bufferManager,
    currentPlaylist,
    scheduler,
    nextPlaylist,
    segmentFetchedQueue,
    restartSegmentFetchWorker,
    cancelCurrentSegmentFetches,
  }: ChangeParams) =>
    Effect.gen(function*() {
      yield* Effect.logInfo("distinct representation; clearing previous playlist scheduling state");
      const videoBuffer = BufferManager.findFirstVideoBuffer(bufferManager);
      if (!videoBuffer) {
        return yield* Effect.logError("Invariant violation: Unable to find video buffer for ABR switch");
      }
      yield* Ref.update(currentPlaylist, () => nextPlaylist);
      yield* cancelCurrentSegmentFetches;
      yield* SegmentFetchedQueue.clear(segmentFetchedQueue);
      scheduler.fetchMap.clear();
      yield* BufferManager.clearVideoBuffer(bufferManager);
      yield* BufferManager.addInit(bufferManager, {
        playlist: nextPlaylist,
        sourceBuffer: videoBuffer,
      });
      yield* restartSegmentFetchWorker;
    });
}
