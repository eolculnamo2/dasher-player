import { Duration } from "effect";
import { BufferManager } from "../buffer_manager/buffer_manager";
import { DashManifest } from "../dash_manifest/dash_manifest";

// zones for buffer based ABR
export namespace BufferZone {
  export type Type = "critical" | "caution" | "reservoir" | "healthy";

  const DEFAULT_THRESHOLD: Readonly<
    Record<
      Exclude<Type, "healthy">,
      {
        static: Duration.Duration;
        live: Duration.Duration;
      }
    >
  > = {
    critical: {
      static: Duration.seconds(3),
      live: Duration.seconds(2),
    },
    caution: {
      static: Duration.seconds(8),
      live: Duration.seconds(4),
    },
    reservoir: {
      static: Duration.seconds(20),
      live: Duration.seconds(5),
    },
  };

  export type GetParams = {
    bufferManager: BufferManager.Type;
    manifest: DashManifest.Type;
    mediaElement: HTMLMediaElement;
  };
  export const get = ({ bufferManager, manifest, mediaElement }: GetParams): Type => {
    const currentTime = mediaElement.currentTime;
    const runway = BufferManager.getBufferRunway(bufferManager, currentTime);
    // inlining values for now, but with live, chunk size, segment length (in time), and other nuances, they'll be programmatic
    // reservoir -- and maybe all -- will be different based on current representation bitrate
    const lessThan = Duration.greaterThan(runway);
    const key: "static" | "live" = DashManifest.isLive(manifest) ? "live" : "static";
    if (lessThan(DEFAULT_THRESHOLD.critical[key])) {
      return "critical";
    }
    if (lessThan(DEFAULT_THRESHOLD.caution[key])) {
      return "caution";
    }
    if (lessThan(DEFAULT_THRESHOLD.reservoir[key])) {
      return "reservoir";
    }
    return "healthy";
  };

  export namespace Trends {
    export type Type = {

    }

    export const make = () => {

    }
  }
}
