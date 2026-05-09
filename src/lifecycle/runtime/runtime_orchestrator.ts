import { Duration, Effect } from "effect";
import { TickOrchestrator } from "./tick_orchestrator/tick_orchestrator";
import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";

const TICK_SLEEP = Duration.millis(100);

export namespace RuntimeOrchestrator {
  type Params = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    manifest: DashManifest.Type;
    recommendedPlaylist: DashManifest.Playlist;
  };
  export const make = ({ bufferManager, manifest, mediaElement, recommendedPlaylist }: Params) =>
    Effect.gen(function* () {
      const scheduler = yield* SegmentScheduler.make(
        manifest,
        recommendedPlaylist.attributes.RESOLUTION.height,
      );
      // next up is appending init segment to buffer then getting happy path video segments working on a video

      while (true) {
        yield* TickOrchestrator.make({ buffer: bufferManager, mediaElement });
        yield* Effect.sleep(TICK_SLEEP);
      }
    });
}
