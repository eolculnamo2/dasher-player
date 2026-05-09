import { Effect } from "effect";
import { MediaSourceModule } from "@/src/domain/media_source/media_source";
import type { Dasher } from "@/src/lifecycle/init/dasher_init_params";
import { ManifestFetcher } from "@/src/fetchers/manifest_fetcher/manifest_fetcher";
import { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";
import { BufferManager } from "@/src/domain/buffer_manager/buffer_manager";

export namespace BootstrapOrchestrator {
  export const make = (params: Dasher.ValidatedParams.T & { bufferManager: BufferManager.Type }) =>
    Effect.gen(function* () {
      // We may consider using fibers to parallelize MediaSource construction, manifest fetch
      // and potentially others

      // Create media source
      const { mediaSource } = yield* MediaSourceModule.make(params.mediaElement);

      // Fetch dash manifest
      const manifestTxt = yield* ManifestFetcher.fetch(params.manifestUrl);

      // Parse dash manifest
      const manifest = yield* DashManifest.make(manifestTxt);

      // Find recommended playlist (video only for now)
      const recommendedPlaylist = DashManifest.getRecommendedVideoPlaylist(
        manifest,
        params.mediaElement,
      );

      // create source buffer
      const sourceBuffer = yield* BufferManager.createBuffer(params.bufferManager, {
        mediaSource,
        codec: DashManifest.codecByPlaylist(recommendedPlaylist),
      });

      return {
        sourceBuffer,
        mediaSource,
        manifest,
        recommendedPlaylist,
      };
    });
}
