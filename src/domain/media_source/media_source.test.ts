import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Effect, Either } from "effect";
import { MediaSourceModule } from "@/src/domain/media_source/media_source";

class FakeMediaSource extends EventTarget {
  static instances: FakeMediaSource[] = [];
  static throwOnCreate: unknown;

  constructor() {
    super();

    if (FakeMediaSource.throwOnCreate !== undefined) {
      throw FakeMediaSource.throwOnCreate;
    }

    FakeMediaSource.instances.push(this);
  }
}

class FakeMediaElement extends EventTarget {
  src = "";
  loadCalls = 0;
  removedAttributes: string[] = [];

  load() {
    this.loadCalls += 1;
  }

  removeAttribute(name: string) {
    this.removedAttributes.push(name);

    if (name === "src") {
      this.src = "";
    }
  }
}

const originalMediaSourceDescriptor = Object.getOwnPropertyDescriptor(globalThis, "MediaSource");
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

let createdUrls: string[];
let revokedUrls: string[];
let createObjectUrlError: unknown;

const installMediaSource = () => {
  Object.defineProperty(globalThis, "MediaSource", {
    configurable: true,
    value: FakeMediaSource,
  });
};

const uninstallMediaSource = () => {
  if (originalMediaSourceDescriptor) {
    Object.defineProperty(globalThis, "MediaSource", originalMediaSourceDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "MediaSource");
  }
};

const makeMediaElement = (): HTMLMediaElement =>
  new FakeMediaElement() as unknown as HTMLMediaElement;

const runScopedEither = <A, E>(effect: Effect.Effect<A, E, never>) =>
  Effect.runPromise(Effect.either(effect));

const runMakeScopedEither = (mediaElement: HTMLMediaElement, timeoutMs = 25) =>
  runScopedEither(
    Effect.scoped(
      MediaSourceModule.make(mediaElement, {
        sourceOpenTimeoutMs: timeoutMs,
      }),
    ),
  );

const dispatchSourceOpen = () => {
  FakeMediaSource.instances.at(-1)?.dispatchEvent(new Event("sourceopen"));
};

const dispatchSourceError = () => {
  FakeMediaSource.instances.at(-1)?.dispatchEvent(new Event("error"));
};

beforeEach(() => {
  FakeMediaSource.instances = [];
  FakeMediaSource.throwOnCreate = undefined;
  createdUrls = [];
  revokedUrls = [];
  createObjectUrlError = undefined;

  installMediaSource();

  URL.createObjectURL = ((object: Blob | MediaSource) => {
    if (createObjectUrlError !== undefined) {
      throw createObjectUrlError;
    }

    const url = `blob:test-${createdUrls.length}`;
    createdUrls.push(url);
    expect(object).toBe(FakeMediaSource.instances.at(-1));
    return url;
  }) as typeof URL.createObjectURL;

  URL.revokeObjectURL = ((url: string) => {
    revokedUrls.push(url);
  }) as typeof URL.revokeObjectURL;
});

afterEach(() => {
  uninstallMediaSource();
  URL.createObjectURL = originalCreateObjectUrl;
  URL.revokeObjectURL = originalRevokeObjectUrl;
});

describe("MediaSourceModule.make", () => {
  test("creates, mounts, waits for sourceopen, and returns the initialized resources", async () => {
    const mediaElement = makeMediaElement();

    const resultPromise = Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const result = yield* MediaSourceModule.make(mediaElement);

          expect(result.mediaSource).toBe(FakeMediaSource.instances[0]);
          expect(result.mediaElement).toBe(mediaElement);
          expect(mediaElement.src).toBe("blob:test-0");

          return result;
        }),
      ),
    );

    await Promise.resolve();
    dispatchSourceOpen();

    const result = await resultPromise;

    expect(result.mediaSource).toBe(FakeMediaSource.instances[0]);
    expect(createdUrls).toEqual(["blob:test-0"]);
    expect(revokedUrls).toEqual(["blob:test-0"]);
  });

  test("clears and reloads the media element when its scope closes", async () => {
    const mediaElement = makeMediaElement();
    const fakeElement = mediaElement as unknown as FakeMediaElement;

    const resultPromise = runMakeScopedEither(mediaElement);

    await Promise.resolve();
    dispatchSourceOpen();

    const result = await resultPromise;

    expect(Either.isRight(result)).toBe(true);
    expect(fakeElement.src).toBe("");
    expect(fakeElement.removedAttributes).toEqual(["src"]);
    expect(fakeElement.loadCalls).toBe(1);
    expect(revokedUrls).toEqual(["blob:test-0"]);
  });

  test("does not clear a later media element source during cleanup", async () => {
    const mediaElement = makeMediaElement();
    const fakeElement = mediaElement as unknown as FakeMediaElement;

    const resultPromise = Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* MediaSourceModule.make(mediaElement);

          mediaElement.src = "blob:next-owner";
        }),
      ),
    );

    await Promise.resolve();
    dispatchSourceOpen();
    await resultPromise;

    expect(fakeElement.src).toBe("blob:next-owner");
    expect(fakeElement.removedAttributes).toEqual([]);
    expect(fakeElement.loadCalls).toBe(0);
    expect(revokedUrls).toEqual(["blob:test-0"]);
  });

  test("fails when MediaSource is unsupported", async () => {
    uninstallMediaSource();

    const result = await runMakeScopedEither(makeMediaElement());

    expect(Either.isLeft(result)).toBe(true);

    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MediaSourceModule.MediaSourceUnsupportedError);
      expect(result.left._tag).toBe("MediaSourceUnsupportedError");
    }
  });

  test("fails when MediaSource construction throws", async () => {
    const cause = new Error("constructor failed");
    FakeMediaSource.throwOnCreate = cause;

    const result = await runMakeScopedEither(makeMediaElement());

    expect(Either.isLeft(result)).toBe(true);

    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MediaSourceModule.MediaSourceCreateError);
      expect(result.left.cause).toBe(cause);
    }

    expect(createdUrls).toEqual([]);
    expect(revokedUrls).toEqual([]);
  });

  test("fails when object URL creation throws", async () => {
    const cause = new Error("object URL failed");
    createObjectUrlError = cause;

    const result = await runMakeScopedEither(makeMediaElement());

    expect(Either.isLeft(result)).toBe(true);

    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MediaSourceModule.MediaSourceMountError);
      expect(result.left.cause).toBe(cause);
    }

    expect(revokedUrls).toEqual([]);
  });

  test("fails with MediaSourceOpenError when the MediaSource emits error before opening", async () => {
    const mediaElement = makeMediaElement();

    const resultPromise = runMakeScopedEither(mediaElement);
    await Promise.resolve();
    dispatchSourceError();

    const result = await resultPromise;

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MediaSourceModule.MediaSourceOpenError);
      expect(result.left.cause).toBeInstanceOf(Event);
    }

    expect(revokedUrls).toEqual(["blob:test-0"]);
  });

  test("fails with timeout when sourceopen is not emitted", async () => {
    const mediaElement = makeMediaElement();
    const fakeElement = mediaElement as unknown as FakeMediaElement;

    const result = await runMakeScopedEither(mediaElement, 1);

    expect(Either.isLeft(result)).toBe(true);
    if (Either.isLeft(result)) {
      expect(result.left).toBeInstanceOf(MediaSourceModule.MediaSourceOpenTimeoutError);
      expect(result.left.timeoutMs).toBe(1);
    }

    expect(fakeElement.src).toBe("");
    expect(fakeElement.loadCalls).toBe(1);
    expect(revokedUrls).toEqual(["blob:test-0"]);
  });
});
