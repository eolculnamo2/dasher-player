export namespace MediaElement {
  export type Type = HTMLMediaElement;

  export const inBufferRange = (self: HTMLMediaElement, time: number): boolean => {
    if (!self?.buffered.length) {
      return false;
    }
    if (self.buffered.length > 1) {
      console.warn(
        "dasher buffered is expected to never have a length > 1 but has",
        self.buffered.length,
      );
      return false;
    }
    return self.buffered.start(0) <= time && time <= self.buffered.end(0);
  };
  export const findBufferedRange = (
    mediaElement: HTMLMediaElement,
    time: number,
    epsilon = 0.05,
  ): { start: number; end: number } | null => {
    const ranges = mediaElement.buffered;

    for (let i = 0; i < ranges.length; i++) {
      const start = ranges.start(i);
      const end = ranges.end(i);

      if (time + epsilon >= start && time - epsilon <= end) {
        return { start, end };
      }
    }

    return null;
  };
}
