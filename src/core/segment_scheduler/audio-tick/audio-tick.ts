import { Duration, Effect } from "effect";
import type { Codec } from "../../codec/codec";
import { DashManifest } from "../../dash_manifest/dash_manifest";
import { BufferManager } from "../../buffer_manager/buffer_manager";
import { MediaElement } from "../../media_element/media_element";

export namespace AudioTick {
  export type HandleParams = {
    manifest: DashManifest.Type;
    buffer: BufferManager.Type;
    mimeType: Codec.MimeType.Type;
    neededBuffer: Duration.Duration;
    mediaElement: HTMLMediaElement;
  };

  export const handle = ({
    mediaElement,
    manifest,
    buffer,
    mimeType,
    neededBuffer,
  }: HandleParams) =>
    Effect.gen(function* () {
      const playlist = DashManifest.getAudioPlaylist(manifest);
      if (!playlist) {
        yield* Effect.logDebug("no audio playlist.. skipping");
        return {
          mimeType,
          segments: [],
        };
      }
      const firstSegment = playlist.segments[0];
      if (!firstSegment) {
        console.warn("failed to schedule missing audio segments");
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

      const range = MediaElement.findBufferedRange(mediaElement, mediaElement.currentTime);
      const isNewBuffer = range == null;
      const bufferEnd = isNewBuffer
        ? Math.max(firstSegment.presentationTime, mediaElement.currentTime)
        : range.end;

      // would do it this way if we could reliably enforce only one buffered
      // const bufferEnd = MediaElement.inBufferRange(mediaElement, mediaElement.currentTime)
      //   ? audioBuffer.buffered.end(0)
      //   : Math.max(firstSegment.presentationTime, mediaElement.currentTime);

      const currentSegment = DashManifest.findCurrentSegment(manifest, playlist, bufferEnd);
      if (!currentSegment) {
        throw new Error(
          `Invariant violation: Unable to find current audio segment! ${bufferEnd} for ${mimeType}`,
        );
      }

      return {
        isNewBuffer,
        mimeType,
        segments: DashManifest.getSegmentsToFetch(
          playlist.segments,
          currentSegment.number,
          Duration.toSeconds(neededBuffer),
        ),
      };
    });
}
