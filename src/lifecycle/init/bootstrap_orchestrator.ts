import type { Dasher } from "./dasher_init_params";

export namespace BootstrapOrchestrator {
  export const make = (params: Dasher.ValidatedParams.T) => {
    // this is where we need to think for a moment >> What should happen and in what order.
    // We at least need to construct media source and source buffer
    // We should initialize state
    // Fetch and parse dash manifest
    // Estimate bandwidth for initial ABR ladder
    // Finally, get the Buffer (TM) to start fetching segments.
    // Only some of these need done for "just getting it working" stage of all this
  }
}
