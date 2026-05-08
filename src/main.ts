import { Effect } from "effect";
import { Dasher } from "@/src/lifecycle/init/dasher_init_params";
import { BootstrapOrchestrator } from "@/src/lifecycle/init/bootstrap_orchestrator/bootstrap_orchestrator";
import { FetchHttpClient } from "@effect/platform";

const make = (params: Dasher.Params.T) =>
  Effect.scoped(
    Effect.gen(function* () {
      const validatedParams = Dasher.Params.validate(params);
      const bootstrap = yield* BootstrapOrchestrator.make(validatedParams);
      Effect.logDebug("Bootstrap complete");
      console.log(bootstrap);
    }),
  ).pipe(Effect.provide(FetchHttpClient.layer));

export const init = (params: Dasher.Params.T) => {
  Effect.runPromise(make(params));
};
