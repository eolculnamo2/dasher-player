import { Duration, Effect } from "effect";
import { TickOrchestrator } from "./tick_orchestrator/tick_orchestrator";
import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/domain/segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueue } from "@/src/domain/segmnet_pending_queue/segment_pending_queue";
import { SegmentFetchWorker } from "@/src/domain/segment_fetch_worker/segment_fetch_worker";

const RUNTIME_INTERVAL = Duration.millis(200);

export namespace RuntimeOrchestrator {
  let lifetimeTick = Duration.millis(0);
  type Params = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    manifest: DashManifest.Type;
    recommendedPlaylist: DashManifest.Playlist;
  };
  export const make = ({ bufferManager, manifest, mediaElement, recommendedPlaylist }: Params) =>
    Effect.gen(function*() {
      const segmentFetchedQueue = yield* SegmentFetchedQueue.make();
      const segmentPendingQueue = yield* SegmentPendingQueue.make();
      const scheduler = SegmentScheduler.make();

      // may move this back? my hesitation is race conditions when things like seeked events clear
      // the queue, but im not sure if that's actually justified
      yield* Effect.fork(
        SegmentFetchWorker.subscribe({
          bufferManager,
          mediaElement,
          segmentFetchedQueue,
          segmentPendingQueue,
        }),
      );
      while (true) {
        yield* TickOrchestrator.make({
          buffer: bufferManager,
          mediaElement,
          recommendedPlaylist,
          segmentFetchedQueue,
          segmentPendingQueue,
          scheduler,
          manifest,
          lifetimeTick,
        });
        yield* Effect.sleep(RUNTIME_INTERVAL);
        lifetimeTick = Duration.sum(lifetimeTick, RUNTIME_INTERVAL);
      }
    });
}
