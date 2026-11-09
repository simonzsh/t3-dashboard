import assert from "node:assert/strict";
import { test } from "bun:test";
import { enter } from "../../src/ui/motion.ts";

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
