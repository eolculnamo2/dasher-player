// @ts-expect-error mpd-parser does not ship types
import { parse } from "mpd-parser";
import { Data, Effect } from "effect";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import { Codec } from "../codec/codec";
import { RecommendedBitratePolicy } from "@/src/policy/recommended_bitrate_policy/recommended_bitrate_policy";

export namespace DashManifest {
  export const DashSegmentMap = Schema.Struct({
    uri: Schema.String,
    resolvedUri: Schema.optional(Schema.String),
  });

  export type DashSegmentMap = typeof DashSegmentMap.Type;

  export const DashSegment = Schema.Struct({
    uri: Schema.String,
    resolvedUri: Schema.optional(Schema.String),
    duration: Schema.Number,
    map: Schema.optional(DashSegmentMap),
    number: Schema.optional(Schema.Number),
    presentationTime: Schema.optional(Schema.Number),
  });

  export type DashSegment = typeof DashSegment.Type;

  export const PlaylistAttributes = Schema.asSchema(
    Schema.Struct({
      // NAME: Schema.optional(Schema.String),
      // AUDIO: Schema.optional(Schema.String),
      CODECS: Schema.optional(Schema.String),
      BANDWIDTH: Schema.optional(Schema.Number),
      RESOLUTION: Schema.optional(Schema.Struct({
        width: Schema.Number,
        height: Schema.Number,
      })),
    }).pipe(
      Schema.extend(
        Schema.Record({
          key: Schema.String,
          value: Schema.Unknown,
        }),
      ),
    ),
  );

  export type PlaylistAttributes = typeof PlaylistAttributes.Type;

  export const Playlist = Schema.Struct({
    uri: Schema.String,
    resolvedUri: Schema.optional(Schema.String),
    endList: Schema.Boolean,
    segments: Schema.mutable(Schema.Array(DashSegment)),
    attributes: PlaylistAttributes,
  });

  export type Playlist = typeof Playlist.Type;

  export const DashMediaGroupRendition = Schema.Struct({
    default: Schema.optional(Schema.Boolean),
    autoselect: Schema.optional(Schema.Boolean),
    playlists: Schema.optional(Schema.mutable(Schema.Array(Playlist))),
  });

  export type DashMediaGroupRendition = typeof DashMediaGroupRendition.Type;

  const MediaGroupRenditions: Schema.Schema<
    Record<string, Record<string, DashMediaGroupRendition>>
  > = Schema.Record({
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
    playlists: Playlist[];
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
    playlists: Schema.mutable(Schema.Array(Playlist)),
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
  export type Type = typeof Manifest.Type;
  export class MissingCodec extends Data.TaggedError("MediaSourceUnsupportedError")<{}> { }

  export const make = (raw: string): Effect.Effect<Manifest, ParseResult.ParseError> =>
    Effect.suspend(() =>
      Schema.decodeUnknown(Manifest)(parse(raw)).pipe(
        Effect.tapError((error) => Effect.logError(ParseResult.TreeFormatter.formatErrorSync(error))),
      ),
    );

  export const codecByPlaylist = (playlist: Playlist): Codec.Type =>
    Codec.makeVideo(playlist.attributes.CODECS);

  // need ot figure out how mpd-parser does video vs audio adaptations although with playlists, they might just be combined
  export const getRecommendedVideoPlaylist = (self: Type, mediaElement: HTMLMediaElement): Playlist =>
    RecommendedBitratePolicy.chooseStartupRepresentation(self.playlists, mediaElement);
}
