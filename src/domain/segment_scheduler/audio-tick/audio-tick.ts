import { Effect } from "effect";
import type { Codec } from "../../codec/codec";
import { DashManifest } from "../../dash_manifest/dash_manifest";

export namespace AudioTick {
  export type HandleParams = {
    manifest: DashManifest.Type;
    preferredPlaylist: { height: number; bandwidth: number };
    currentTime: number;
    mimeType: Codec.MimeType.Type;
    neededBuffer: number;
  };

  export const handle = ({
    manifest,
    preferredPlaylist,
    currentTime,
    mimeType,
    neededBuffer,
  }: HandleParams) =>
    Effect.gen(function*() {
      const playlist = DashManifest.getAudioPlaylist(manifest);
      if (!playlist) {
        yield* Effect.logDebug("no audio playlist.. skipping");
        return {
          mimeType,
          segments: [],
        }
      }
      const currentSegment = DashManifest.findCurrentSegment(playlist, currentTime);
      if (!currentSegment) {
        throw new Error(
          `Invariant violation: Unable to find current segment! ${currentTime} on ${preferredPlaylist.height} for ${mimeType}`,
        );
      }

      return {
        mimeType,
        segments: DashManifest.getSegmentsToFetch(
          playlist.segments,
          currentSegment.number,
          neededBuffer,
        ),
      }
    });
}
