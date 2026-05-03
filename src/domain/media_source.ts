export namespace MediaSource {
  type InitReturn = {
    mediaSource: MediaSource;
  }

  export const make = async (mediaElement: HTMLMediaElement): Promise<Result<InitReturn, DasherError>> => {
    const mediaSource = new MediaSource();
    const mountResult = await MountMediaSource.make(mediaElement, mediaSource);
    if (mountResult.isErr()) {
      return err(mountResult.error);
    }

    return ok({
      mediaSource,
    });
  }
}
