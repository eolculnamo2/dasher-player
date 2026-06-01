// On representation change, we must:
// 1a) Schedule new init segment to come before scheduled segments at current representation, but not before currently scheduled segments
// 1b) Optionally clear the buffer and have newly scheduled segments start at segment beginning boundary of current time (introduces rebuffer)
// 1c) Optionally clear the buffer AFTER the end of current segment and start init + new segments there

import { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { SegmentFetchedQueue } from "@/src/core/segment_fetched_queue/segment_fetched_queue";
import { SegmentPendingQueues } from "@/src/core/segment_pending_queues/segment_pending_queues";
import type { SegmentOrder } from "@/src/core/segment_order/segment_order";
import { SegmentScheduler } from "@/src/core/segment_scheduler/segment_scheduler";
import { Effect, Ref } from "effect";
import { ResetBufferProcess } from "../reset_buffer_process/reset_buffer_process";

export namespace RepresentationChangeProcess {
  export type ChangeParams = {
    currentPlaylist: Ref.Ref<DashManifest.Playlist>;
    nextPlaylist: DashManifest.Playlist;
    bufferManager: BufferManager.Type;
    scheduler: SegmentScheduler.Type;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
    segmentPendingQueue: SegmentPendingQueues.Type;
    lastAppendedSegment: Ref.Ref<SegmentOrder.Type>;
    cancelCurrentSegmentFetches: Effect.Effect<void>;
    restartSegmentFetchWorker: Effect.Effect<void>;
  };
  // only leaving this as a thin wrapper around ResetBuffer because I anticipate to add here later
  export const handleChange = (params: ChangeParams) =>
    Effect.gen(function* () {
      yield* Effect.logInfo("distinct representation; clearing previous playlist scheduling state");
      yield* ResetBufferProcess.reset(params);
    });
}
