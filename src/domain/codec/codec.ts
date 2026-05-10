import { Brand } from "effect";

export namespace Codec {
  export type Type = Brand.Brand<"Codec">;
  export const makeVideo = Brand.refined<Type>(
    (raw) => typeof raw === "string" && MediaSource.isTypeSupported(MimeType.toString(MimeType.fromRawCodec("video/mp4", raw))),
    (raw) => Brand.error(`Codec ${raw} is not supported by media source`),
  );
  export const toString = (self: Type): string => self as unknown as string;

  export namespace MimeType {
    export type Type = Brand.Brand<"MimeType">;
    const make = Brand.nominal<Type>();
    export const fromRawCodec = (mediaKind: "video/mp4" | "audio/mp4", rawCodec: Codec.Type | string): Type => make(`${mediaKind}; codecs="${rawCodec}"`);
    export const fromCodec = (mediaKind: "video/mp4" | "audio/mp4", codec: Codec.Type): Type => fromRawCodec(mediaKind, codec);
    export const toString = (self: Type): string => self as unknown as string;
  }
}
