import { Duration, Effect } from "effect";
import type { Codec } from "../../codec/codec";
import { DashManifest } from "../../dash_manifest/dash_manifest";
import { BufferManager } from "../../buffer_manager/buffer_manager";

export namespace VideoTick {
  export type HandleParams = {
    buffer: BufferManager.Type;
    manifest: DashManifest.Type;
    preferredPlaylist: { height: number; bandwidth: number };
    mimeType: Codec.MimeType.Type;
    neededBuffer: Duration.Duration;
  };

  export const handle = ({
    buffer,
    manifest,
    preferredPlaylist,
    mimeType,
    neededBuffer,
  }: HandleParams) =>
    Effect.gen(function* () {
      const playlist = DashManifest.getPlaylistByHeight(manifest, preferredPlaylist.height);
      const videoBuffer = BufferManager.findFirstVideoBuffer(buffer);
      const firstSegment = playlist.segments[0];
      if (!firstSegment) {
        console.warn("failed to schedule missing video segments");
        return {
          mimeType,
          segments: [],
        };
      }
      if (!videoBuffer) {
        console.warn("unable to find video buffer");
        return {
          mimeType,
          segments: [],
        };
      }

      const bufferEnd = videoBuffer.buffered.length
        ? videoBuffer.buffered.end(0)
        : firstSegment.presentationTime;
      const currentSegment = DashManifest.findCurrentSegment(playlist, bufferEnd);
      if (!currentSegment) {
        throw new Error(
          `Invariant violation: Unable to find current video segment! ${bufferEnd} on ${preferredPlaylist.height} for ${mimeType}`,
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
