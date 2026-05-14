import { describe, expect, test } from "bun:test";
import { Effect, Either } from "effect";
import type * as ParseResult from "effect/ParseResult";
import type { ManifestUrl } from "../manifest_url/manifest_url";
import { DashManifest } from "./dash_manifest";

const validStaticMpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10S" minBufferTime="PT1S">
  <Period duration="PT10S">
    <AdaptationSet mimeType="video/mp4" codecs="avc1.4d401e" segmentAlignment="true">
      <Representation id="video-1" bandwidth="1000000" width="640" height="360">
        <BaseURL>video/</BaseURL>
        <SegmentTemplate timescale="1" duration="2" startNumber="1" media="seg-$Number$.m4s" initialization="init.mp4" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const validMultiRenditionMpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT6S" minBufferTime="PT1S">
  <Period duration="PT6S">
    <AdaptationSet mimeType="video/mp4" codecs="avc1.4d401e" segmentAlignment="true">
      <Representation id="video-low" bandwidth="500000" width="426" height="240">
        <BaseURL>low/</BaseURL>
        <SegmentTemplate timescale="1" duration="2" startNumber="1" media="seg-$Number$.m4s" initialization="init.mp4" />
      </Representation>
      <Representation id="video-high" bandwidth="1500000" width="1280" height="720">
        <BaseURL>high/</BaseURL>
        <SegmentTemplate timescale="1" duration="2" startNumber="1" media="seg-$Number$.m4s" initialization="init.mp4" />
      </Representation>
    </AdaptationSet>
  </Period>
</MPD>`;

const incompleteMpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10S">
  <Period />
</MPD>`;

const manifestUrl = "https://example.com/manifest.mpd" as ManifestUrl.T;

const parseEither = (raw: string): Promise<Either.Either<DashManifest.Type, ParseResult.ParseError>> =>
  Effect.runPromise(Effect.either(DashManifest.make(raw, manifestUrl)));

describe("DashManifest.make", () => {
  test("returns a Manifest effect for a valid static MPD", async () => {
    const result = await parseEither(validStaticMpd);

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.duration).toBe(10);
      expect(result.right.playlists).toHaveLength(1);
      expect(result.right.playlists[0]?.segments).toHaveLength(5);
    }
  });

  test("returns a Manifest effect for a valid MPD with multiple renditions", async () => {
    const result = await parseEither(validMultiRenditionMpd);

    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      expect(result.right.duration).toBe(6);
      expect(result.right.playlists).toHaveLength(2);
    }
  });

  test("fails with a ParseError when parsed output does not match the Manifest schema", async () => {
    const result = await parseEither(incompleteMpd);

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left._tag).toBe("ParseError");
    }
  });
});
