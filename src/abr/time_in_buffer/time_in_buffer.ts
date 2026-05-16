import { Duration } from "effect";

export namespace TimeInBuffer {
  export type Type = Duration.Duration;
  // this categories for this are still in discovery. We'll tune this to whats useful over time
  // note -- growing is not yet used, but leaving it as I anticipate it will be useful soon -- if never, then remove
  export type Age = "gestation" | "growing" | "mature";

  const GROWING_THRESHOLD = Duration.seconds(4);
  const MATURE_THRESHOLD = Duration.seconds(10);

  export const make = (): Type => Duration.zero;
  export const getAge = (self: Type): Age => {
    if (Duration.greaterThan(self, MATURE_THRESHOLD)) {
      return "mature";
    }
    if (Duration.greaterThan(self, GROWING_THRESHOLD)) {
      return "growing";
    }
    return "gestation";
  };
}
