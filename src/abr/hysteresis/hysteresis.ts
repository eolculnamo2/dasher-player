import type { BufferZone } from "@/src/domain/buffer_zone/buffer_zone";
import type { TimeInBuffer } from "../time_in_buffer/time_in_buffer"

export namespace Hysteresis {
  export type Type = {
    timeInBuffer: TimeInBuffer.Type;
    zoneTrends: BufferZone.Trends.Type;
  }

  export const make = () => {

  }
}
