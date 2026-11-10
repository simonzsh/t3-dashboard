import assert from "node:assert/strict";
import { test } from "bun:test";
import { enter, leaveCopy, pauseAnimations } from "../../src/ui/motion.ts";

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
    enter(element, { duration: 650, highlight: "blue" });
    assert.equal(calls[1]!.options.duration, 650);
    assert.equal(calls[1]!.frames[1]!.backgroundColor, "blue");
    assert.equal(calls[1]!.frames[1]!.offset, 0.45);
    assert.equal(calls[1]!.frames[2]!.backgroundColor, "transparent");
    reduce = true;
    assert.equal(enter(element, { y: 6 }), null);
    assert.equal(calls.length, 2);
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

function animation(state: AnimationPlayState = "running") {
  return {
    playState: state,
    plays: 0,
    pause() { this.playState = "paused"; },
    play() { this.plays++; this.playState = "running"; },
  };
}

test("a pose change never restarts the replaced CSS animation", () => {
  const old = animation();
  let current = [old];
  const resume = pauseAnimations({ isConnected: true, getAnimations: () => current });
  const next = animation();
  current = [next];
  resume();
  assert.equal(old.plays, 0);
  assert.equal(next.plays, 0);
});

test("cancelled animations and detached elements are never resumed", () => {
  const cancelled = animation();
  const resume = pauseAnimations({ isConnected: true, getAnimations: () => [cancelled] });
  cancelled.playState = "idle";
  resume();
  assert.equal(cancelled.plays, 0);

  const detached = animation();
  const element = { isConnected: true, getAnimations: () => [detached] };
  const restore = pauseAnimations(element);
  element.isConnected = false;
  restore();
  assert.equal(detached.plays, 0);
});

test("the retained idle animation resumes once, without touching an existing pause", () => {
  const running = animation();
  const paused = animation("paused");
  const resume = pauseAnimations({ isConnected: true, getAnimations: () => [running, paused] });
  assert.equal(running.playState, "paused");
  resume();
  resume();
  assert.equal(running.plays, 1);
  assert.equal(paused.plays, 0);
});

test("FLIP uses the batch measurement without layout reads between animation writes", async () => {
  const { animateFlip } = await import("../../src/ui/motion.ts");
  const original = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
  let count = 0;
  const element = {
    getBoundingClientRect() { throw new Error("unexpected layout read"); },
    animate() { count++; return {} as Animation; },
  } as unknown as Element;
  try {
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
    const before = { left: 0, top: 10, width: 200, height: 40 };
    const after = { ...before, top: 50 };
    animateFlip(element, before, after, 0);
    assert.equal(count, 1);
    assert.equal(animateFlip(element, after, after, 0), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "matchMedia", original);
    else Reflect.deleteProperty(globalThis, "matchMedia");
  }
});
