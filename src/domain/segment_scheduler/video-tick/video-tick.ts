import { Effect } from "effect";
import type { Codec } from "../../codec/codec";
import { DashManifest } from "../../dash_manifest/dash_manifest";

export namespace VideoTick {
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
  }: HandleParams) => {
    const playlist = DashManifest.getPlaylistByHeight(manifest, preferredPlaylist.height);
    const currentSegment = DashManifest.findCurrentSegment(playlist, currentTime);
    if (!currentSegment) {
      throw new Error(
        `Invariant violation: Unable to find current segment! ${currentTime} on ${preferredPlaylist.height} for ${mimeType}`,
      );
    }
    return Effect.sync(() =>({
      mimeType,
      segments: DashManifest.getSegmentsToFetch(playlist.segments, currentSegment.number, neededBuffer),
    }));
  };
}
