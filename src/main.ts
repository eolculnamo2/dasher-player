import { Effect } from "effect";
import { Dasher } from "@/src/lifecycle/init/dasher_init_params";
import { BootstrapOrchestrator } from "@/src/lifecycle/init/bootstrap_orchestrator/bootstrap_orchestrator";
import { FetchHttpClient } from "@effect/platform";
import { RuntimeOrchestrator } from "./lifecycle/runtime/runtime_orchestrator";
import { BufferManager } from "./core/buffer_manager/buffer_manager";

const make = (params: Dasher.Params.T) =>
  Effect.scoped(
    Effect.gen(function* () {
      const validatedParams = Dasher.Params.validate(params);
      const bufferManager = BufferManager.make();
      const bootstrap = yield* BootstrapOrchestrator.make({ ...validatedParams, bufferManager });

      Effect.logDebug("Bootstrap complete");

      yield* RuntimeOrchestrator.make({
        ...bootstrap,
        bufferManager,
        mediaElement: params.mediaElement,
      });

      Effect.logDebug("Runtime complete");
    }),
  ).pipe(Effect.provide(FetchHttpClient.layer));

export const init = (params: Dasher.Params.T) => {
  Effect.runPromise(make(params));
};
