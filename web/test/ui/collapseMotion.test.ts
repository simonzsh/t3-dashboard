import assert from "node:assert/strict";
import { test } from "bun:test";
import { CollapseMotion } from "../../src/ui/collapseMotion.ts";

test("width reflow cancels height motion; content changes and explicit toggles still animate", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
  const calls: Keyframe[][] = [];
  let cancelled = 0;
  let reduce = false;
  const inner = { offsetWidth: 600, offsetHeight: 200 };
  const element = {
    offsetHeight: 0, style: { height: "" },
    getBoundingClientRect() { throw new Error("transformed dimensions must not drive layout"); },
    animate(frames: Keyframe[]) { calls.push(frames); return { cancel() { cancelled++; } }; },
  };
  const motion = new CollapseMotion();
  const resize = (open = true) => motion.resize(element as unknown as HTMLElement, inner as HTMLElement, open, 80);
  try {
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: reduce }) });
    resize();
    assert.equal(calls.length, 1);
    element.offsetHeight = 120;
    inner.offsetWidth = 500;
    inner.offsetHeight = 240;
    resize();
    assert.equal(cancelled, 1);
    assert.equal(element.style.height, "240px");
    assert.equal(calls.length, 1, "width changes snap to the reflowed height");
    element.offsetHeight = 240;
    inner.offsetWidth = 450;
    resize();
    assert.equal(calls.length, 1, "width changes with stable height do not animate");
    inner.offsetHeight = 280;
    resize();
    assert.equal(calls.length, 2, "new content at a stable width still animates");
    element.offsetHeight = 250;
    resize(false);
    assert.equal(element.style.height, "0px");
    assert.equal(calls.length, 3, "closing remains animated");
    element.offsetHeight = 0;
    inner.offsetWidth = 600;
    resize();
    assert.equal(calls.length, 4, "opening remains animated even after a width change");
    reduce = true;
    element.offsetHeight = 280;
    inner.offsetHeight = 300;
    resize();
    assert.equal(calls.length, 4);
    assert.equal(element.style.height, "300px");
    motion.cancel();
  } finally {
    if (original) Object.defineProperty(globalThis, "matchMedia", original);
    else Reflect.deleteProperty(globalThis, "matchMedia");
  }
});

test("width reflow does not measure the old height of each disclosure", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "matchMedia");
  let reads = 0;
  const inner = { offsetWidth: 600, offsetHeight: 200 };
  const element = {
    get offsetHeight() { reads++; return 0; },
    style: { height: "" },
    animate() { return { cancel() {} }; },
  };
  try {
    Object.defineProperty(globalThis, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
    const motion = new CollapseMotion();
    const resize = () => motion.resize(element as unknown as HTMLElement, inner as HTMLElement, true, 80);
    resize();
    reads = 0;
    inner.offsetWidth = 500;
    inner.offsetHeight = 240;
    resize();
    assert.equal(reads, 0, "reflow must not read the previous layout before snapping");
    assert.equal(element.style.height, "240px");
    inner.offsetWidth = 450;
    resize();
    assert.equal(reads, 0, "stable heights must not cause old-layout reads either");
    const observed = {
      get offsetWidth() { throw new Error("observer sizes must avoid layout reads"); },
      get offsetHeight() { throw new Error("observer sizes must avoid layout reads"); },
    };
    motion.resize(element as unknown as HTMLElement, observed as unknown as HTMLElement, true, 80, { width: 400, height: 260 });
    assert.equal(element.style.height, "260px");
    assert.equal(reads, 0, "observer-driven reflow must skip old-layout reads");
    motion.cancel();
  } finally {
    if (original) Object.defineProperty(globalThis, "matchMedia", original);
    else Reflect.deleteProperty(globalThis, "matchMedia");
  }
});
