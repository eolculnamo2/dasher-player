import { ManifestUrl } from "../../domain/manifest_url/manifest_url";

// import type { DasherError } from "../domain/error";

export namespace Dasher {
  export namespace Params {
    export type T = {
      mediaElement: HTMLMediaElement;
      manifestUrl: string;
      // config?: {
      //   manifest: ManifestFetcherConfig.T;
      // }
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
      // config: {
    };
  }

  // export type Error = DasherError.T;
}
