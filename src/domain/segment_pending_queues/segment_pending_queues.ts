import { Effect, Queue } from "effect";
import type { DashManifest } from "../dash_manifest/dash_manifest";
import { Codec } from "../codec/codec";

// would be nice if this enforced more invariants eventually (i.e. ordering etc)
export namespace SegmentPendingQueues {
  export type Kind = "video" | "audio";

  export type Queued = {
    mimeType: Codec.MimeType.Type;
    segment: DashManifest.DashSegment;
  };

  export type Type = {
    videoQueue: Queue.Queue<Queued>;
    audioQueue: Queue.Queue<Queued>;
  };

  export const make = () =>
    Effect.gen(function* () {
      const videoQueue = yield* Queue.unbounded<Queued>();
      const audioQueue = yield* Queue.unbounded<Queued>();
      return {
        videoQueue,
        audioQueue,
      };
    });

  export const getQueue = (self: Type, kind: Kind) =>
    kind === "video" ? self.videoQueue : self.audioQueue;

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

  export const add = (self: Type, kind: Kind, next: Queued) =>
    Effect.gen(function* () {
      yield* Queue.offer(getQueue(self, kind), next);
    });

  export const takeAll = (self: Type, kind: Kind) =>
    Effect.gen(function* () {
      return yield* Queue.takeAll(getQueue(self, kind));
    });

  export const clear = (self: Type, kind?: Kind) =>
    Effect.gen(function* () {
      if (kind) {
        yield* Queue.takeAll(getQueue(self, kind));
        return;
      }
      yield* Queue.takeAll(self.videoQueue);
      yield* Queue.takeAll(self.audioQueue);
    });
}
