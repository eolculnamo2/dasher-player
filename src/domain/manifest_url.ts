import { Brand } from "effect";

export namespace ManifestUrl {
  export type T = string & Brand.Brand<"manifestUrl">;
  export type T_raw = string;

  // validations will go here
  export const make = Brand.nominal<T>();
}
