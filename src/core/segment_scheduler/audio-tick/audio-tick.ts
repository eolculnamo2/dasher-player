import { Duration, Effect } from "effect";
import type { Codec } from "../../codec/codec";
import { DashManifest } from "../../dash_manifest/dash_manifest";
import { BufferManager } from "../../buffer_manager/buffer_manager";

export namespace AudioTick {
  export type HandleParams = {
    manifest: DashManifest.Type;
    buffer: BufferManager.Type;
    mimeType: Codec.MimeType.Type;
    neededBuffer: Duration.Duration;
  };

  export const handle = ({ manifest, buffer, mimeType, neededBuffer }: HandleParams) =>
    Effect.gen(function* () {
      const playlist = DashManifest.getAudioPlaylist(manifest);
      if (!playlist) {
        yield* Effect.logDebug("no audio playlist.. skipping");
        return {
          mimeType,
          segments: [],
        };
      }

      const audioBuffer = BufferManager.findFirstAudioBuffer(buffer);
      if (!audioBuffer) {
        console.warn("unable to find audio buffer");
        return {
          mimeType,
          segments: [],
        };
      }

      const bufferEnd = audioBuffer.buffered.length ? audioBuffer.buffered.end(0) : 0;
      const currentSegment = DashManifest.findCurrentSegment(playlist, bufferEnd);
      if (!currentSegment) {
        throw new Error(
          `Invariant violation: Unable to find current audio segment! ${bufferEnd} for ${mimeType}`,
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
