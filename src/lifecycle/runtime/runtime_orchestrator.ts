import { HttpClient } from "@effect/platform";
import { Duration, Effect, Fiber, Ref } from "effect";
import { TickOrchestrator } from "./tick_orchestrator/tick_orchestrator";
import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import { SegmentScheduler } from "@/src/core/segment_scheduler/segment_scheduler";
import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/core/segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueues } from "@/src/core/segment_pending_queues/segment_pending_queues";
import { SegmentFetchWorker } from "@/src/core/segment_fetch_worker/segment_fetch_worker";
import { MediaEventHandler } from "@/src/core/media_event_handler/media_event_handler";
import { Hysteresis } from "@/src/abr/hysteresis/hysteresis";
import { SegmentOrder } from "@/src/core/segment_order/segment_order";

const RUNTIME_INTERVAL = Duration.millis(200);

export namespace RuntimeOrchestrator {
  type Params = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    manifest: DashManifest.Type;
    recommendedPlaylist: DashManifest.Playlist;
  };
  export const make = ({ bufferManager, manifest, mediaElement, recommendedPlaylist }: Params) =>
    Effect.gen(function*() {
      // will make a RuntimeState module to manage these and potentially look at state machines
      const lastAppendedSegment = yield* SegmentOrder.make();
      const currentPlaylist = yield* Ref.make(recommendedPlaylist);
      const hysteresis = yield* Ref.make(Hysteresis.make());
      const segmentFetchedQueue = yield* SegmentFetchedQueue.make();
      const segmentPendingQueue = yield* SegmentPendingQueues.make();
      const scheduler = SegmentScheduler.make();
      const httpClient = yield* HttpClient.HttpClient;

      const segmentFetchWorker = () =>
        SegmentFetchWorker.subscribe({
          bufferManager,
          mediaElement,
          segmentFetchedQueue,
          segmentPendingQueue,
          scheduler,
          manifest,
        }).pipe(Effect.provideService(HttpClient.HttpClient, httpClient));
      let segmentFetchWorkerFiber = yield* Effect.forkDaemon(segmentFetchWorker());
      const cancelCurrentSegmentFetches = Effect.gen(function*() {
        yield* Fiber.interrupt(segmentFetchWorkerFiber);
      });
      const restartSegmentFetchWorker = Effect.gen(function*() {
        // TODO: move worker lifecycle management behind a long-lived control channel.
        scheduler.fetchMap.clear();
        segmentFetchWorkerFiber = yield* Effect.forkDaemon(segmentFetchWorker());
      });

      yield* MediaEventHandler.subscribe({
        mediaElement,
        segmentFetchedQueue,
        segmentPendingQueue,
        scheduler,
        cancelCurrentSegmentFetches,
        restartSegmentFetchWorker,
      });

      while (true) {
        yield* TickOrchestrator.make({
          buffer: bufferManager,
          mediaElement,
          currentPlaylist,
          segmentFetchedQueue,
          segmentPendingQueue,
          scheduler,
          manifest,
          hysteresis,
          cancelCurrentSegmentFetches,
          restartSegmentFetchWorker,
          lastAppendedSegment,
        });
        yield* Effect.sleep(RUNTIME_INTERVAL);
        yield* Hysteresis.incrementTimeInBuffer(hysteresis, RUNTIME_INTERVAL);
      }
    });
}
