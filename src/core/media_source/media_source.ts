import { Brand, Data, Duration, Effect, Fiber } from "effect";
import type { Scope } from "effect/Scope";

export namespace MediaSourceModule {
  // naming this opened because it was opened at one point in the past (at construction), but may not stay that way.
  // The useful guarantee is that we've tracked it's initial source open even if we have to check readyState elsewhere
  export namespace OpenedMediaSource {
    export type Type = MediaSource & Brand.Brand<"OpenMediaSource">;
    export const validate = Brand.refined<Type>(
      (raw) => raw instanceof MediaSource && raw.readyState === "open",
      (raw) =>
        raw instanceof MediaSource
          ? Brand.error(`MediaSource is not open, but is ${raw.readyState}`)
          : Brand.error("MediaSource is not open"),
    );
    export const make = (mediaSource: MediaSource): Type => validate(mediaSource);
    export const isStillOpen = (self: Type) => self.readyState === "open";
  }
  export interface InitReturn {
    mediaSource: OpenedMediaSource.Type;
    mediaElement: HTMLMediaElement;
  }

  export class MediaSourceUnsupportedError extends Data.TaggedError(
    "MediaSourceUnsupportedError",
  )<{}> {}

  export class MediaSourceCreateError extends Data.TaggedError("MediaSourceCreateError")<{
    cause: unknown;
  }> {}

  export class MediaSourceMountError extends Data.TaggedError("MediaSourceMountError")<{
    cause: unknown;
  }> {}

  export class MediaSourceOpenError extends Data.TaggedError("MediaSourceOpenError")<{
    cause: unknown;
  }> {}

  export class MediaSourceOpenTimeoutError extends Data.TaggedError("MediaSourceOpenTimeoutError")<{
    timeoutMs: number;
  }> {}

  export type Error =
    | MediaSourceUnsupportedError
    | MediaSourceCreateError
    | MediaSourceMountError
    | MediaSourceOpenError
    | MediaSourceOpenTimeoutError;

  const createMediaSource = (): Effect.Effect<
    MediaSource,
    MediaSourceUnsupportedError | MediaSourceCreateError
  > =>
    Effect.gen(function* () {
      if (!("MediaSource" in globalThis)) {
        return yield* Effect.fail(new MediaSourceUnsupportedError());
      }

      return yield* Effect.try({
        try: () => new MediaSource(),
        catch: (cause) => new MediaSourceCreateError({ cause }),
      });
    });

  const mountMediaSource = (
    mediaElement: HTMLMediaElement,
    mediaSource: MediaSource,
  ): Effect.Effect<HTMLMediaElement, MediaSourceMountError, Scope> =>
    Effect.acquireRelease(
      Effect.try({
        try: () => URL.createObjectURL(mediaSource),
        catch: (cause) => new MediaSourceMountError({ cause }),
      }),
      (url) =>
        Effect.sync(() => {
          if (mediaElement.src === url) {
            mediaElement.removeAttribute("src");
            mediaElement.load();
          }

          URL.revokeObjectURL(url);
        }),
    ).pipe(
      Effect.map((url) => {
        mediaElement.src = url;
        return mediaElement;
      }),
      Effect.tap(() => Effect.logDebug("media source mounted")),
      Effect.tapError((e) => Effect.logError(`failed to mount media source! ${e}`)),
    );

  export const waitForSourceOpen = (
    mediaSource: MediaSource,
  ): Effect.Effect<void, MediaSourceOpenError> =>
    Effect.async<void, MediaSourceOpenError>((resume) => {
      const cleanup = () => {
        mediaSource.removeEventListener("sourceopen", onSourceOpen);
        mediaSource.removeEventListener("error", onSourceError);
      };

      const onSourceOpen = () => {
        cleanup();
        resume(Effect.logDebug("MediaSource opened").pipe(Effect.asVoid));
      };

      const onSourceError = (event: Event) => {
        cleanup();
        resume(Effect.fail(new MediaSourceOpenError({ cause: event })));
      };

      mediaSource.addEventListener("sourceopen", onSourceOpen, { once: true });
      mediaSource.addEventListener("error", onSourceError, { once: true });

      return Effect.sync(cleanup);
    });

  export const make = (
    mediaElement: HTMLMediaElement,
    options?: {
      sourceOpenTimeoutMs?: number;
    },
  ): Effect.Effect<InitReturn, Error, Scope> =>
    Effect.gen(function* () {
      const sourceOpenTimeoutMs = options?.sourceOpenTimeoutMs ?? 5_000;
      yield* Effect.logDebug("Creating MediaSource");
      const mediaSource = yield* createMediaSource();
      yield* Effect.logDebug("Mounting MediaSource");

      const waitFiber = yield* waitForSourceOpen(mediaSource).pipe(Effect.forkScoped);
      const mountedMediaElement = yield* mountMediaSource(mediaElement, mediaSource);

      yield* Fiber.join(waitFiber).pipe(
        Effect.timeoutFail({
          duration: Duration.millis(sourceOpenTimeoutMs),
          onTimeout: () =>
            new MediaSourceOpenTimeoutError({
              timeoutMs: sourceOpenTimeoutMs,
            }),
        }),
      );

      yield* Effect.logDebug("MediaSource initialized");

      return {
        mediaSource: OpenedMediaSource.make(mediaSource),
        mediaElement: mountedMediaElement,
      };
    }).pipe(
      Effect.tapError((error) =>
        Effect.logError("MediaSource initialization failed").pipe(
          Effect.annotateLogs({
            error: error._tag,
          }),
        ),
      ),
    );
}
