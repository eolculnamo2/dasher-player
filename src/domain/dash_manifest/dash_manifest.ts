// @ts-expect-error mpd-parser does not ship types
import { parse } from "mpd-parser";
import { Effect } from "effect";
import type * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";

export type DashSegmentMap = {
  uri: string;
  resolvedUri?: string;
};

export const DashSegmentMap: Schema.Schema<DashSegmentMap> = Schema.Struct({
  uri: Schema.String,
  resolvedUri: Schema.optional(Schema.String),
});

export type DashSegment = {
  uri: string;
  resolvedUri?: string;
  duration: number;
  map?: DashSegmentMap;
  number?: number;
  presentationTime?: number;
};

export const DashSegment: Schema.Schema<DashSegment> = Schema.Struct({
  uri: Schema.String,
  resolvedUri: Schema.optional(Schema.String),
  duration: Schema.Number,
  map: Schema.optional(DashSegmentMap),
  number: Schema.optional(Schema.Number),
  presentationTime: Schema.optional(Schema.Number),
});

export type DashPlaylistAttributes = Record<string, unknown> & {
  NAME?: string;
  AUDIO?: string;
  CODECS?: string;
  BANDWIDTH?: number;
};

export const DashPlaylistAttributes = Schema.asSchema(
  Schema.Struct({
    NAME: Schema.optional(Schema.String),
    AUDIO: Schema.optional(Schema.String),
    CODECS: Schema.optional(Schema.String),
    BANDWIDTH: Schema.optional(Schema.Number),
  }).pipe(
    Schema.extend(
      Schema.Record({
        key: Schema.String,
        value: Schema.Unknown,
      }),
    ),
  ),
) as Schema.Schema<DashPlaylistAttributes>;

export type DashPlaylist = {
  uri: string;
  resolvedUri?: string;
  endList: boolean;
  segments: DashSegment[];
  attributes: DashPlaylistAttributes;
};

export const DashPlaylist = Schema.Struct({
  uri: Schema.String,
  resolvedUri: Schema.optional(Schema.String),
  endList: Schema.Boolean,
  segments: Schema.mutable(Schema.Array(DashSegment)),
  attributes: DashPlaylistAttributes,
}) as Schema.Schema<DashPlaylist>;

export type DashMediaGroupRendition = {
  default?: boolean;
  autoselect?: boolean;
  playlists?: DashPlaylist[];
};

export const DashMediaGroupRendition = Schema.Struct({
  default: Schema.optional(Schema.Boolean),
  autoselect: Schema.optional(Schema.Boolean),
  playlists: Schema.optional(Schema.mutable(Schema.Array(DashPlaylist))),
}) as Schema.Schema<DashMediaGroupRendition>;

const MediaGroupRenditions: Schema.Schema<Record<string, Record<string, DashMediaGroupRendition>>> =
  Schema.Record({
    key: Schema.String,
    value: Schema.Record({
      key: Schema.String,
      value: DashMediaGroupRendition,
    }),
  });

export type Manifest = {
  allowCache: boolean;
  endList: boolean;
  mediaSequence?: number;
  discontinuitySequence?: number;
  playlistType?: string;
  playlists: DashPlaylist[];
  mediaGroups: {
    AUDIO: Record<string, Record<string, DashMediaGroupRendition>>;
    VIDEO: Record<string, Record<string, DashMediaGroupRendition>>;
    "CLOSED-CAPTIONS": Record<string, Record<string, DashMediaGroupRendition>>;
    SUBTITLES: Record<string, Record<string, DashMediaGroupRendition>>;
  };
  dateTimeString?: string;
  dateTimeObject?: Date;
  targetDuration?: number;
  duration: number;
  discontinuityStarts: number[];
};

export const Manifest = Schema.Struct({
  allowCache: Schema.Boolean,
  endList: Schema.Boolean,
  mediaSequence: Schema.optional(Schema.Number),
  discontinuitySequence: Schema.optional(Schema.Number),
  playlistType: Schema.optional(Schema.String),
  playlists: Schema.mutable(Schema.Array(DashPlaylist)),
  mediaGroups: Schema.Struct({
    AUDIO: MediaGroupRenditions,
    VIDEO: MediaGroupRenditions,
    "CLOSED-CAPTIONS": MediaGroupRenditions,
    SUBTITLES: MediaGroupRenditions,
  }),
  dateTimeString: Schema.optional(Schema.String),
  dateTimeObject: Schema.optional(Schema.DateFromSelf),
  targetDuration: Schema.optional(Schema.Number),
  duration: Schema.Number,
  discontinuityStarts: Schema.mutable(Schema.Array(Schema.Number)),
}) as Schema.Schema<Manifest>;

export namespace DashManifest {
  export const make = (raw: string): Effect.Effect<Manifest, ParseResult.ParseError> =>
    Effect.suspend(() => Schema.decodeUnknown(Manifest)(parse(raw)));
}
