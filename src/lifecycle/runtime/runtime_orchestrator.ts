import { Duration, Effect } from "effect";
import { TickOrchestrator } from "./tick_orchestrator/tick_orchestrator";
import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import { SegmentScheduler } from "@/src/domain/segment_scheduler/segment_scheduler";

const TICK_SLEEP = Duration.millis(100);

export namespace RuntimeOrchestrator {
  type Params = {
    mediaElement: HTMLMediaElement;
  };
  export const make = ({ mediaElement }: Params) =>
    Effect.gen(function* () {
      const buffer = BufferManager.make();
      const scheduler = SegmentScheduler.make();

      while (true) {
        yield* TickOrchestrator.make({ buffer, mediaElement });
        yield* Effect.sleep(TICK_SLEEP);
      }
    });
}
