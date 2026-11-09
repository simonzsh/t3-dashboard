import assert from "node:assert/strict";
import { test } from "bun:test";
import { enter, leaveCopy } from "../../src/ui/motion.ts";

test("staggered arrivals hold their start frame and respect reduced motion", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
  let reduce = false;
  const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
  const element = { animate: (frames: Keyframe[], options: KeyframeAnimationOptions) => { calls.push({ frames, options }); return {} as Animation; } } as unknown as Element;
  try {
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduce }) });
    enter(element, { y: 6, duration: 220, delay: 45 });
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0]!.frames, [
      { opacity: 0, translate: "0px 6px", scale: "1" },
      { opacity: 1, translate: "0 0", scale: "1" },
    ]);
    assert.equal(calls[0]!.options.duration, 220);
    assert.equal(calls[0]!.options.delay, 45);
    assert.equal(calls[0]!.options.fill, "backwards");
    reduce = true;
    assert.equal(enter(element, { y: 6 }), null);
    assert.equal(calls.length, 1);
  } finally {
    if (original) Object.defineProperty(globalThis, "matchMedia", original);
    else Reflect.deleteProperty(globalThis, "matchMedia");
  }
});

test("an exit copy stays until its slide and fade finish, including after a drag", async () => {
  const media = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
  const doc = Object.getOwnPropertyDescriptor(globalThis, "document");
  const calls: Array<{ frames: Keyframe[]; options: KeyframeAnimationOptions }> = [];
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => { finish = resolve; });
  const animate = (frames: Keyframe[], options: KeyframeAnimationOptions) => {
    calls.push({ frames, options });
    return { finished } as unknown as Animation;
  };
  let appended = 0;
  let removed = false;
  let reduce = false;
  const moving = { style: { translate: "0 90px" }, animate };
  const copy = {
    style: {},
    querySelectorAll: () => [],
    querySelector: () => moving,
    removeAttribute: () => {},
    setAttribute: () => {},
    remove: () => { removed = true; },
    animate,
  };
  const source = {
    hidden: false,
    isConnected: true,
    cloneNode: () => copy,
    querySelectorAll: () => [],
  } as unknown as HTMLElement;
  try {
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduce }) });
    Object.defineProperty(globalThis, "document", { configurable: true, value: { body: { append: () => { appended++; } } } });
    const to = { translate: "0 100%", scale: "1" };
    const options = { duration: 280, easing: "cubic-bezier(0.4, 0, 1, 1)" };
    leaveCopy(source, ".dialog", to, options);
    await Promise.resolve();
    assert.equal(appended, 0, "StrictMode cleanup must not create an exit copy");
    leaveCopy(source, ".dialog", to, options);
    Object.assign(source, { isConnected: false });
    await Promise.resolve();
    assert.equal(appended, 1);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0]!.frames, [{ translate: "0 90px", scale: "1" }, to]);
    assert.deepEqual(calls[1]!.frames, [{ opacity: 1 }, { opacity: 0 }]);
    for (const call of calls) assert.deepEqual(call.options, { ...options, fill: "forwards" });
    assert.equal(removed, false);
    finish();
    await Promise.resolve();
    assert.equal(removed, true);
    reduce = true;
    leaveCopy(source, ".dialog", to, options);
    await Promise.resolve();
    assert.equal(appended, 1, "Reduced motion must skip the exit copy");
  } finally {
    if (media) Object.defineProperty(globalThis, "matchMedia", media);
    else Reflect.deleteProperty(globalThis, "matchMedia");
    if (doc) Object.defineProperty(globalThis, "document", doc);
    else Reflect.deleteProperty(globalThis, "document");
  }
});
