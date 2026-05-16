import { Duration } from "effect";

export namespace TimeInBuffer {
  export type Type = Duration.Duration;
  // this categories for this are still in discovery. We'll tune this to whats useful over time
  export type Age = "gestation" | "growing" | "mature";

  const GROWING_THRESHOLD = Duration.seconds(3);
  const MATURE_THRESHOLD = Duration.seconds(10);

  export const make = () => 0;
  export const getAge = (self: Type): Age => {
    if (Duration.greaterThan(GROWING_THRESHOLD, self)) {
      return "growing";
    }
    if (Duration.greaterThan(MATURE_THRESHOLD, self)) {
      return "mature";
    }
    return "gestation";
  };
}
