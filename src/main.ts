import { Effect, Console } from "effect";
import type { Dasher } from "./lifecycle/init/dasher_init_params";

export const make = (params: Dasher.Params.T) => {
  const program = Console.log("Hello, World!");
  Effect.runSync(program);
};
