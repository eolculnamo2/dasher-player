import { Duration, Effect } from "effect";
import type { Codec } from "../../codec/codec";
import { DashManifest } from "../../dash_manifest/dash_manifest";

export namespace AudioTick {
  export type HandleParams = {
    manifest: DashManifest.Type;
    currentTime: number;
    mimeType: Codec.MimeType.Type;
    neededBuffer: Duration.Duration;
  };

  export const handle = ({ manifest, currentTime, mimeType, neededBuffer }: HandleParams) =>
    Effect.gen(function* () {
      const playlist = DashManifest.getAudioPlaylist(manifest);
      if (!playlist) {
        yield* Effect.logDebug("no audio playlist.. skipping");
        return {
          mimeType,
          segments: [],
        };
      }
      const currentSegment = DashManifest.findCurrentSegment(playlist, currentTime);
      if (!currentSegment) {
        throw new Error(
          `Invariant violation: Unable to find current audio segment! ${currentTime} for ${mimeType}`,
        );
      }

      return {
        mimeType,
        segments: DashManifest.getSegmentsToFetch(
          playlist.segments,
          currentSegment.number,
          Duration.toSeconds(neededBuffer),
        ),
      };
    });
}
