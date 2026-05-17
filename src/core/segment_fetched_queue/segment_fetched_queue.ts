import { Effect, Queue } from "effect";
import type { DashManifest } from "../dash_manifest/dash_manifest";
import type { Codec } from "../codec/codec";

// would be nice if this enforced more invariants eventually (i.e. ordering etc)
export namespace SegmentFetchedQueue {
  export type Queued = {
    data: ArrayBuffer;
    playlistId: string;
    segment: DashManifest.DashSegment;
    mimeType: Codec.MimeType.Type;
  };

  export type Type = {
    queue: Queue.Queue<Queued>;
  };

  export const make = () =>
    Effect.gen(function* () {
      const queue = yield* Queue.unbounded<Queued>();
      return {
        queue,
      };
    });

  export const add = (self: Type, next: Queued) =>
    Effect.gen(function* () {
      yield* Queue.offer(self.queue, next);
    });

  export const addMany = (self: Type, next: Queued[]) =>
    Effect.gen(function* () {
      yield* Queue.offerAll(self.queue, next);
    });

  export const take = (self: Type) =>
    Effect.gen(function* () {
      return yield* Queue.take(self.queue);
    });

  export const takeAll = (self: Type) =>
    Effect.gen(function* () {
      return yield* Queue.takeAll(self.queue);
    });

  export const clear = (self: Type) =>
    Effect.gen(function* () {
      yield* Queue.takeAll(self.queue);
    });
}
