import { Effect } from "effect";
import { Dasher } from "./lifecycle/init/dasher_init_params";
import { BootstrapOrchestrator } from "./lifecycle/init/bootstrap_orchestrator/bootstrap_orchestrator";
import { FetchHttpClient } from "@effect/platform";

export const make = (params: Dasher.Params.T) =>
  Effect.gen(function*() {
    const validatedParams = Dasher.Params.validate(params);
    const bootstrap = yield* BootstrapOrchestrator.make(validatedParams);
    Effect.logDebug("Bootstrap complete");
  }).pipe(Effect.provide(FetchHttpClient.layer));

export const init = (params: Dasher.Params.T) => {
  Effect.runSync(make(params));
};
