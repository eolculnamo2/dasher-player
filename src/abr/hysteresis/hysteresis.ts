import { BufferZone } from "@/src/core/buffer_zone/buffer_zone";
import { TimeInBuffer } from "../time_in_buffer/time_in_buffer";
import { Duration, Ref } from "effect";

export namespace Hysteresis {
  export type Type = {
    timeInBuffer: TimeInBuffer.Type;
    zoneTrends: BufferZone.Trends.Type;
  };

  export const make = (): Type => ({
    timeInBuffer: TimeInBuffer.make(),
    zoneTrends: BufferZone.Trends.make(),
  });

  export const incrementTimeInBuffer = (self: Ref.Ref<Type>, by: Duration.Duration) =>
    Ref.update(self, (s) => ({
      ...s,
      timeInBuffer: Duration.sum(s.timeInBuffer, by),
    }));

  export const resetTimeInBuffer = (self: Ref.Ref<Type>) =>
    Ref.update(self, (s) => ({
      ...s,
      timeInBuffer: Duration.zero,
    }));
}
