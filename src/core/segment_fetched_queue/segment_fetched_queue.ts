import { Chunk, Effect, Queue, Ref } from "effect";
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

  export type Type = Ref.Ref<Queue.Queue<Queued>>;

  export const make = (): Effect.Effect<Type> =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<Queued>();
      return yield* Ref.make(queue);
    });

  export const add = (self: Type, next: Queued): Effect.Effect<void> =>
    Effect.gen(function*() {
      const queue = yield* Ref.get(self);
      yield* Queue.offer(queue, next);
    });

  export const addMany = (self: Type, next: Queued[]): Effect.Effect<void> =>
    Effect.gen(function*() {
      const queue = yield* Ref.get(self);
      yield* Queue.offerAll(queue, next);
    });

  export const take = (self: Type): Effect.Effect<Queued> =>
    Effect.gen(function*() {
      const queue = yield* Ref.get(self);
      return yield* Queue.take(queue);
    });

  export const takeAll = (self: Type): Effect.Effect<Queued[]> =>
    Effect.gen(function*() {
      const queue = yield* Ref.get(self);
      return yield* Queue.takeAll(queue).pipe(Effect.map(Chunk.toArray));
    });

  export const size = (self: Type): Effect.Effect<number> =>
    Effect.gen(function*() {
      const queue = yield* Ref.get(self);
      return yield* queue.size;
    });

  export const clear = (self: Type): Effect.Effect<void> =>
    Effect.gen(function*() {
      const nextQueue = yield* Queue.unbounded<Queued>();
      const previousQueue = yield* Ref.modify(self, (queue) => [queue, nextQueue]);
      yield* Queue.shutdown(previousQueue);
      yield* Queue.awaitShutdown(previousQueue);
    });
}
