import type { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";
import { Effect } from "effect";

export namespace TickOrchestrator {
  type Params = {
    buffer: BufferManager.Type;
    mediaElement: HTMLMediaElement;
  };
  export const make = ({ buffer, mediaElement }: Params) =>
    Effect.gen(function* () {
      // may move this.. just reminding myself why i brought media element in
      const currentTime = mediaElement.currentTime;

      // get buffer state BUFFER
      // pass buffer state to scheduler figure out what we need next SCHEDULER
      //
      //
      // buffer uses fetch segments to grab what it needs and append to SourceBuffers BUFFER
      // or should the fetch be in the orchestrator?
    });
}
