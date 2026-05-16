import { ManifestUrl } from "@/src/core/manifest_url/manifest_url";

export namespace Dasher {
  export namespace Params {
    export type T = {
      mediaElement: HTMLMediaElement;
      manifestUrl: string;
    };

    export const validate = (raw: T): ValidatedParams.T => {
      const manifestUrl = ManifestUrl.make(raw.manifestUrl);
      return {
        mediaElement: raw.mediaElement,
        manifestUrl,
      };
    };
  }

  export namespace ValidatedParams {
    export type T = {
      mediaElement: HTMLMediaElement;
      manifestUrl: ManifestUrl.T;
    };
  }
}
