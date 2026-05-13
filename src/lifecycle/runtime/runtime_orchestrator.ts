import { Duration, Effect } from "effect";
import { TickOrchestrator } from "./tick_orchestrator/tick_orchestrator";
import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/domain/segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueues } from "@/src/domain/segment_pending_queues/segment_pending_queues";
import { SegmentFetchWorker } from "@/src/domain/segment_fetch_worker/segment_fetch_worker";
import { MediaEventHandler } from "@/src/domain/media_event_handler/media_event_handler";

const RUNTIME_INTERVAL = Duration.millis(200);

export namespace RuntimeOrchestrator {
  type Params = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    manifest: DashManifest.Type;
    recommendedPlaylist: DashManifest.Playlist;
  };
  export const make = ({ bufferManager, manifest, mediaElement, recommendedPlaylist }: Params) =>
    Effect.gen(function* () {
      const segmentFetchedQueue = yield* SegmentFetchedQueue.make();
      const segmentPendingQueue = yield* SegmentPendingQueues.make();
      const scheduler = SegmentScheduler.make();

      yield* MediaEventHandler.subscribe({
        mediaElement,
        segmentFetchedQueue,
        segmentPendingQueue,
        scheduler,
      });

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
        });
        yield* Effect.sleep(RUNTIME_INTERVAL);
      }
    });
}
