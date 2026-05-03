import { ManifestUrl } from "../../domain/manifest_url";

export namespace Dasher {
  export namespace Params {
    export type T = {
      manifestUrl: string;
      // config?: {
      //   manifest: ManifestFetcherConfig.T;
      // }
    };
    export const validated = (raw: T): ValidatedParams.T => {
      const manifestUrl = ManifestUrl.make(raw.manifestUrl);
      return {
        manifestUrl,
      };
    };
  }

  export namespace ValidatedParams {
    export type T = {
      manifestUrl: ManifestUrl.T;
      // config: {
    };
  }
}
