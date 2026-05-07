import type { DashManifest } from "@/src/domain/dash_manifest/dash_manifest";

export namespace RecommendedBitratePolicy {
  const getStartupBitrate = (connection?: NetworkInformation): number => {
    const downlink = connection?.downlink ?? 1.5;
    const effectiveType = connection?.effectiveType;

    const estimated = downlink * 1_000_000 * 0.65;

    const cap =
      effectiveType === "slow-2g"
        ? 150_000
        : effectiveType === "2g"
          ? 400_000
          : effectiveType === "3g"
            ? 1_500_000
            : effectiveType === "4g"
              ? 8_000_000
              : 2_000_000;

    return Math.min(estimated, cap);
  };

  const getMaxUsefulWidth = (mediaElement: HTMLMediaElement): number => {
    const cssWidth = mediaElement.clientWidth || window.innerWidth;

    const dpr = window.devicePixelRatio || 1;

    // Useful encoded width for the visible display area.
    return Math.ceil(cssWidth * dpr);
  };

  export const chooseStartupRepresentation = (
    representations: DashManifest.Playlist[],
    mediaElement: HTMLMediaElement,
    connection?: NetworkInformation,
  ): DashManifest.Playlist => {
    if (representations.length === 0) {
      throw new Error(
        "invariant violation: cannot pass empty representations on startup representation",
      );
    }
    const targetBitrate = getStartupBitrate(connection);
    const maxUsefulWidth = getMaxUsefulWidth(mediaElement);

    const candidates = representations
      .filter((rep) => rep.attributes.BANDWIDTH <= targetBitrate)
      .filter((rep) => rep.attributes.RESOLUTION.width <= maxUsefulWidth)
      .sort((a, b) => b.attributes.BANDWIDTH - a.attributes.BANDWIDTH);

    const recommended =
      candidates[0] ??
      representations
        .filter((rep) => rep.attributes.RESOLUTION.width <= maxUsefulWidth)
        .sort((a, b) => a.attributes.BANDWIDTH - b.attributes.BANDWIDTH)[0] ??
      representations.sort((a, b) => a.attributes.BANDWIDTH - b.attributes.BANDWIDTH)[0];

    if (!recommended) {
      throw new Error("invariant violation: representation not available");
    }
    return recommended;
  };
}
