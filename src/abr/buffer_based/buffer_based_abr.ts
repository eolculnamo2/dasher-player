import type { BufferManager } from "@/src/core/buffer_manager/buffer_manager";
import { TimeInBuffer } from "../time_in_buffer/time_in_buffer";
import { DashManifest } from "@/src/core/dash_manifest/dash_manifest";
import { BufferZone } from "@/src/core/buffer_zone/buffer_zone";
import { Duration, Effect, Ref } from "effect";
import { Hysteresis } from "../hysteresis/hysteresis";

// first pass without hysteresis
// to be called on segment complete?
export namespace BufferBasedAbr {
  export type NextRepresentationParams = {
    bufferManager: BufferManager.Type;
    manifest: DashManifest.Type;
    mediaElement: HTMLMediaElement;
    currentPlaylist: Ref.Ref<DashManifest.Playlist>;
    hysteresis: Ref.Ref<Hysteresis.Type>;
  };
  export const nextRepresentation = ({
    bufferManager,
    manifest,
    mediaElement,
    currentPlaylist,
    hysteresis,
  }: NextRepresentationParams) =>
    Effect.gen(function* () {
      const hysteresisValue = yield* Ref.get(hysteresis);
      const timeInBuffer = hysteresisValue.timeInBuffer;

      const playlist = yield* Ref.get(currentPlaylist);
      const zone = BufferZone.get({
        bufferManager,
        manifest,
        mediaElement,
      });

      const age = TimeInBuffer.getAge(timeInBuffer);
      // do not suggest changes until buffer has time to mature
      if (age === "gestation") {
        return playlist;
      }

      // it's had time and should be at reservoir by now, if not, drop currentPlaylist
      // attempt drop 2
      if (zone === "critical") {
        yield* Effect.logInfo("buffer in critical, going down abr ladder up to two times");
        yield* Hysteresis.resetTimeInBuffer(hysteresis);
        return DashManifest.decreasePlaylistBy(manifest, {
          current: playlist,
          by: 2,
        });
      }
      // attempt drop 1
      if (zone === "caution") {
        yield* Effect.logInfo("buffer in caution, going down abr ladder");
        yield* Hysteresis.resetTimeInBuffer(hysteresis);
        return DashManifest.decreasePlaylistBy(manifest, {
          current: playlist,
          by: 1,
        });
      }

      // if age is mature, only increase for healthy buffers
      if (age === 'mature' && zone === "healthy" && Duration.greaterThan(timeInBuffer, Duration.seconds(6))) {
        yield* Effect.logInfo("buffer healthy, going up abr ladder");
        // need to consider time/growth in healthy buffer
        yield* Hysteresis.resetTimeInBuffer(hysteresis);
        return DashManifest.increasePlaylistBy(manifest, {
          current: playlist,
          by: 1,
        });
      }
      return playlist;
    });
}
