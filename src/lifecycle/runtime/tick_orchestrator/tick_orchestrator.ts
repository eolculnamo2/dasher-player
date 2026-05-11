import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import type { SegmentQueue } from "@/src/domain/segment_queue/segment_queue";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";
import { Effect } from "effect";

export namespace TickOrchestrator {
  type Params = {
    buffer: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    segmentQueue: SegmentQueue.Type;
    scheduler: SegmentScheduler.Type;
    recommendedPlaylist: DashManifest.Playlist;
    manifest: DashManifest.Type;
  };
  export const make = ({
    manifest,
    buffer,
    mediaElement,
    segmentQueue,
    recommendedPlaylist,
    scheduler,
  }: Params) =>
    Effect.gen(function* () {
      // may move this.. just reminding myself why i brought media element in
      const currentTime = mediaElement.currentTime;

      yield* BufferManager.flushSegmentQueue(buffer, buffer.buffers.keys(), segmentQueue);
      const bufferBehindMap = BufferManager.bufferBehindTargetByCodec(buffer, currentTime);

      yield* SegmentScheduler.tick(scheduler, {
        manifest,
        recommendedPlaylist,
        requested: bufferBehindMap,
        currentTime,
        segmentQueue,
      });
    });
}
