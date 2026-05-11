import { Duration, Effect } from "effect";
import { TickOrchestrator } from "./tick_orchestrator/tick_orchestrator";
import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import { SegmentQueue } from "@/src/domain/segment_queue/segment_queue";

const TICK_SLEEP = Duration.millis(200);

export namespace RuntimeOrchestrator {
  type Params = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    manifest: DashManifest.Type;
    recommendedPlaylist: DashManifest.Playlist;
  };
  export const make = ({ bufferManager, manifest, mediaElement, recommendedPlaylist }: Params) =>
    Effect.gen(function*() {
      const segmentQueue = yield* SegmentQueue.make();
      const scheduler = SegmentScheduler.make();

      while (true) {
        yield* TickOrchestrator.make({
          buffer: bufferManager,
          mediaElement,
          recommendedPlaylist,
          segmentQueue,
          scheduler,
          manifest,
        });
        yield* Effect.sleep(TICK_SLEEP);
      }
    });
}
