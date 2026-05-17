import { Effect, Ref } from "effect";
import type { Codec } from "../codec/codec";
import type { DashManifest } from "../dash_manifest/dash_manifest";

export namespace SegmentOrder {
  export type Type = Map<Codec.MimeType.Type, number>;

  export const make = () => Ref.make<Type>(new Map());

  // segments must be inserted into source buffers in order -- this helps ensure we don't flush segments to buffer
  // unless we have the right segments
  export type ValidateOrderedCandidatesParams = {
    candidates: Array<{
      mimeType: Codec.MimeType.Type;
      segment: DashManifest.DashSegment;
    }>;
  };
  export const validateOrderedCandidates = (
    self: Ref.Ref<Type>,
    { candidates }: ValidateOrderedCandidatesParams,
  ) =>
    Effect.gen(function*() {
      const lastSegment = yield* Ref.get(self);

      const mimeTypes: Codec.MimeType.Type[] = [];
      for (const c of candidates) {
        if (mimeTypes.includes(c.mimeType)) {
          continue;
        }
        mimeTypes.push(c.mimeType);
      }

      const orderedSegmentNumbers = mimeTypes.map((m) => ({
        mimeType: m,
        segmentNumber: candidates.find((c) => c.mimeType === m)?.segment.number,
      }));

      for (const n of orderedSegmentNumbers) {
        const lastSegmentNumber = lastSegment.get(n.mimeType);
        if (
          lastSegmentNumber != null &&
          n.segmentNumber != null &&
          n.segmentNumber !== lastSegmentNumber + 1
        ) {
          console.log({
            lastSegment,
            orderedSegmentNumbers,
          });
          console.error(
            `Invariant violation: unable to append segments in order - found ${n.segmentNumber}, but expected ${lastSegmentNumber + 1}... placing segments back in queue`,
          );
          return false;
        }
      }
      return true;
    });
}
