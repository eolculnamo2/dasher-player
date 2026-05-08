import { Brand } from "effect";

export namespace Codec {
  export type Type = Brand.Brand<"Codec">;

  export const asMimeType = (mediaKind: "video/mp4" | "audio/mp4", self: Type | string) =>
    `${mediaKind}; codecs="${self}"`;
  export const makeVideo = Brand.refined<Type>(
    (raw) => typeof raw === "string" && MediaSource.isTypeSupported(asMimeType("video/mp4", raw)),
    (raw) => Brand.error(`Codec ${raw} is not supported by media source`),
  );
  export const toString = (self: Type): string => self as unknown as string;
}
