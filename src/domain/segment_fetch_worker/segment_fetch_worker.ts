import { Chunk, Duration, Effect, Queue } from "effect";
import { SegmentPendingQueues } from "../segment_pending_queues/segment_pending_queues";
import { SegmentFetcher } from "@/src/fetchers/segment_fetcher/segment_fetcher";
import { SegmentFetchedQueue } from "../segment_fetched_queue/segment_fetched_queue";
import { BufferManager } from "../buffer_manager/buffer_manager";

// opportunities:
// - differentiate between codec to see how much of each needs caught up (could prioritize by codec, and may queue per codec)i
// - can eventually factor in network quality
// - and remember that simplicity is the cost we pay as we add more sophistication
export namespace SegmentFetchWorker {
  const DEFAULT_MAX_SEGMENTS_PER_TICK = 3;
  const DEFAULT_FETCH_WORKER_SLEEP = Duration.seconds(1);
  const SKIP_SLEEP_BUFFER_THRESHOLD = Duration.seconds(10);
  const SINGLE_SEGMENT_BUFFER_THRESHOLD = Duration.seconds(20);

  type SubscribeParams = {
    bufferManager: BufferManager.Type;
    mediaElement: HTMLMediaElement;
    segmentPendingQueue: SegmentPendingQueues.Type;
    segmentFetchedQueue: SegmentFetchedQueue.Type;
  };

  const shouldSleep = (bufferRunway: Duration.Duration) =>
    Duration.toMillis(bufferRunway) >= Duration.toMillis(SKIP_SLEEP_BUFFER_THRESHOLD);

  // this might be too aggressive -- video element is waiting a while before we're able to play (has a high buffering gaol).
  // The actual solution might be to try to tune the buffering goal on the media source/video element
  const getMaxSegmentsPerLoop = (bufferRunway: Duration.Duration) =>
    Duration.toMillis(bufferRunway) > Duration.toMillis(SINGLE_SEGMENT_BUFFER_THRESHOLD)
      ? 1
      : DEFAULT_MAX_SEGMENTS_PER_TICK;

  const sleepIfNeeded = (bufferRunway: Duration.Duration) =>
    shouldSleep(bufferRunway) ? Effect.sleep(DEFAULT_FETCH_WORKER_SLEEP) : Effect.void;

  const getBufferRunwayByQueueKind = (
    bufferManager: BufferManager.Type,
    currentTime: number,
    kind: SegmentPendingQueues.Kind,
  ) => {
    const runwayByCodec = BufferManager.bufferRunwayByCodec(bufferManager, currentTime);
    const matchingRunways = Array.from(runwayByCodec.entries())
      .filter(([mimeType]) => SegmentPendingQueues.kindFromMimeType(mimeType) === kind)
      .map(([, runway]) => runway);

    if (matchingRunways.length === 0) {
      return Duration.zero;
    }

    return matchingRunways.reduce((lowest, runway) =>
      Duration.toMillis(runway) < Duration.toMillis(lowest) ? runway : lowest,
    );
  };

  const interleave = <A>(left: Array<A>, right: Array<A>) => {
    const result: Array<A> = [];
    const maxLength = Math.max(left.length, right.length);
    for (let i = 0; i < maxLength; i++) {
      const leftItem = left[i];
      if (leftItem) {
        result.push(leftItem);
      }
      const rightItem = right[i];
      if (rightItem) {
        result.push(rightItem);
      }
    }
    return result;
  };

  export const subscribe = ({
    bufferManager,
    mediaElement,
    segmentFetchedQueue,
    segmentPendingQueue,
  }: SubscribeParams) =>
    Effect.forever(
      Effect.gen(function* () {
        const currentTime = mediaElement.currentTime;
        const videoBufferRunway = getBufferRunwayByQueueKind(bufferManager, currentTime, "video");
        const audioBufferRunway = getBufferRunwayByQueueKind(bufferManager, currentTime, "audio");
        const videoMaxSegmentsPerLoop = getMaxSegmentsPerLoop(videoBufferRunway);
        const audioMaxSegmentsPerLoop = getMaxSegmentsPerLoop(audioBufferRunway);
        const videoPending = yield* Queue.takeUpTo(
          segmentPendingQueue.videoQueue,
          videoMaxSegmentsPerLoop,
        );
        const audioPending = yield* Queue.takeUpTo(
          segmentPendingQueue.audioQueue,
          audioMaxSegmentsPerLoop,
        );
        const pendingSegments = interleave(
          Chunk.toArray(videoPending),
          Chunk.toArray(audioPending),
        );

        if (pendingSegments.length === 0) {
          yield* Effect.sleep(DEFAULT_FETCH_WORKER_SLEEP);
          return;
        }

        for (const pending of pendingSegments) {
          if (pending.segment.resolvedUri == null) {
            yield* Effect.logWarning(`skipping segment with missing resolvedUri`);
            continue;
          }
          yield* SegmentFetcher.fetch(pending.segment.resolvedUri).pipe(
            Effect.flatMap((data) =>
              SegmentFetchedQueue.add(segmentFetchedQueue, {
                data,
                segment: pending.segment,
                mimeType: pending.mimeType,
              }),
            ),
          );
        }

        yield* sleepIfNeeded(
          Duration.toMillis(videoBufferRunway) < Duration.toMillis(audioBufferRunway)
            ? videoBufferRunway
            : audioBufferRunway,
        );
      }),
    );
}
