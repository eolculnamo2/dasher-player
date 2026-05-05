import { Effect } from "effect";
import { MediaSourceModule } from "@/src/domain/media_source/media_source";
import type { Dasher } from "@/src/lifecycle/init/dasher_init_params";
import { ManifestFetcher } from "@/src/fetchers/manifest_fetcher/manifest_fetcher";

export namespace BootstrapOrchestrator {
  export const make = (params: Dasher.ValidatedParams.T) =>
    Effect.scoped(
      Effect.gen(function* () {
        // this is where we need to think for a moment >> What should happen and in what order.
        // We at least need to construct media source
        const mediaSource = yield* MediaSourceModule.make(params.mediaElement); // handle errors

        // Fetch dash manifest
        const manifestTxt = yield* ManifestFetcher.fetch(params.manifestUrl);

        // Parse dash manifest

        // create source buffer

        // We should initialize state

        // Estimate bandwidth for initial ABR ladder

        // Finally, get the Buffer (TM) to start fetching segments.

        // Only some of these need done for "just getting it working" stage of all this
      }),
    );
}
