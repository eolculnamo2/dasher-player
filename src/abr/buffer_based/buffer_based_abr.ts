import type { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import { TimeInBuffer } from "../time_in_buffer/time_in_buffer";
import type { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { BufferZone } from "@/src/core/buffer_zone/buffer_zone";

// first pass without hysteresis
export namespace BufferBasedAbr {
  export type NextRepresentationParams = {
    bufferManager: BufferManager.Type;
    manifest: DashManifest.Type;
    mediaElement: HTMLMediaElement;
    currentPlaylist: DashManifest.Playlist;
    timeInBuffer: TimeInBuffer.Type;
  };
  export const nextRepresentation = ({
    bufferManager,
    manifest,
    mediaElement,
    currentPlaylist,
    timeInBuffer,
  }: NextRepresentationParams): DashManifest.Playlist => {
    const zone = BufferZone.get({
      bufferManager,
      manifest,
      mediaElement,
    });

    const age = TimeInBuffer.getAge(timeInBuffer);
    // do not suggest changes until buffer has time to mature
    if (age === "gestation") {
      return currentPlaylist;
    }

    // it's had time and should be at reservoir by now, if not, drop currentPlaylist
    if (age === "growing") {
      // attempt drop 2
      if (zone === "critical") {
        return DashManifest.decreasePlaylistBy(manifest, {
          current: currentPlaylist,
          by: 2,
        });
      }
      // attempt drop 1
      if (zone === "caution") {
        return DashManifest.decreasePlaylistBy(manifest, {
          current: currentPlaylist,
          by: 1,
        });
      }
      return currentPlaylist;
    }

    // if age is mature, only increase for healthy buffers
    if (zone === "healthy") {
      // need to consider time/growth in healthy buffer
      return DashManifest.increasePlaylistBy(manifest, {
        current: currentPlaylist,
        by: 1,
      });
    }
    return currentPlaylist;
  };
}
