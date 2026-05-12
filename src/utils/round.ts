import { Duration } from "effect";

export const floorToNearest100 = (ms: Duration.Duration) =>
  Math.floor(Duration.toMillis(ms) / 100) * 100;
