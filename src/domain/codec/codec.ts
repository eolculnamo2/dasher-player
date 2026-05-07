import { Brand } from "effect";

export namespace Codec {
  export type Type = Brand.Brand<"Codec">;
  export const make = Brand.refined<Type>(
    (raw) => typeof raw === "string" && MediaSource.isTypeSupported(raw),
    (raw) => Brand.error(`Codec ${raw} is not supported by media source`),
  );
  export const toString = (self: Type): string => self as unknown as string;
}
