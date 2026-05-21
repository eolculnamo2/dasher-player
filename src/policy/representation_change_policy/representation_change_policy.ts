// On representation change, we must:
// 1a) Schedule new init segment to come before scheduled segments at current representation, but not before currently scheduled segments
// 1b) Optionally clear the buffer and have newly scheduled segments start at segment beginning boundary of current time (introduces rebuffer)
// 1c) Optionally clear the buffer AFTER the end of current segment and start init + new segments there

import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { Effect, Ref } from "effect";

export namespace RepresentationChangePolicy {
  export type ChangeParams = {
    currentPlaylist: Ref.Ref<DashManifest.Playlist>;
    nextHeight: number;
    mediaElement: HTMLMediaElement;
  };
  export const change = ({}: ChangeParams) =>
    Effect.gen(function* () {
      // we may have to introduce generation count on fetch worker? I'm afraid of the complexity of adding too much top leel state
    });
}
