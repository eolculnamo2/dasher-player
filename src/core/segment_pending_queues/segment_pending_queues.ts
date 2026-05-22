import { Chunk, Effect, Queue, Ref } from "effect";
import type { DashManifest } from "../dash_manifest/dash_manifest";
import { Codec } from "../codec/codec";

export namespace SegmentPendingQueues {
  export type Kind = "video" | "audio";

  export type Queued = {
    mimeType: Codec.MimeType.Type;
    segment: DashManifest.DashSegment;
    playlistId: string;
  };

  export type Type = {
    videoQueue: Ref.Ref<Queue.Queue<Queued>>;
    audioQueue: Ref.Ref<Queue.Queue<Queued>>;
  };

  export const make = (): Effect.Effect<Type> =>
    Effect.gen(function* () {
      const videoQueue = yield* Queue.unbounded<Queued>();
      const audioQueue = yield* Queue.unbounded<Queued>();
      return {
        videoQueue: yield* Ref.make(videoQueue),
        audioQueue: yield* Ref.make(audioQueue),
      };
    });

  const getQueueRef = (self: Type, kind: Kind) =>
    kind === "video" ? self.videoQueue : self.audioQueue;

  const getQueue = (self: Type, kind: Kind): Effect.Effect<Queue.Queue<Queued>> =>
    Ref.get(getQueueRef(self, kind));

  const clearQueue = (queueRef: Ref.Ref<Queue.Queue<Queued>>): Effect.Effect<void> =>
    Effect.gen(function* () {
      const nextQueue = yield* Queue.unbounded<Queued>();
      const previousQueue = yield* Ref.modify(queueRef, (queue) => [queue, nextQueue]);
      yield* Queue.shutdown(previousQueue);
      yield* Queue.awaitShutdown(previousQueue);
    });

  export const kindFromMimeType = (mimeType: Codec.MimeType.Type): Kind | undefined => {
    const mimeTypeString = Codec.MimeType.toString(mimeType);
    if (mimeTypeString.startsWith("video")) {
      return "video";
    }
    if (mimeTypeString.startsWith("audio")) {
      return "audio";
    }
    return undefined;
  };

  export const add = (self: Type, kind: Kind, next: Queued): Effect.Effect<void> =>
    Effect.gen(function* () {
      const queue = yield* getQueue(self, kind);
      yield* Queue.offer(queue, next);
    });

  export const takeAll = (self: Type, kind: Kind): Effect.Effect<Queued[]> =>
    Effect.gen(function* () {
      const queue = yield* getQueue(self, kind);
      return yield* Queue.takeAll(queue).pipe(Effect.map(Chunk.toArray));
    });

  export const takeUpTo = (self: Type, kind: Kind, max: number): Effect.Effect<Queued[]> =>
    Effect.gen(function* () {
      const queue = yield* getQueue(self, kind);
      return yield* Queue.takeUpTo(queue, max).pipe(Effect.map(Chunk.toArray));
    });

  export const clear = (self: Type, kind?: Kind): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (kind) {
        yield* clearQueue(getQueueRef(self, kind));
        return;
      }
      yield* Effect.all([clearQueue(self.videoQueue), clearQueue(self.audioQueue)]);
    });
}
