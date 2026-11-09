import assert from "node:assert/strict";
import { test } from "bun:test";
import { observeSettledWidth } from "../../src/lib/observeSettledWidth.ts";

test("width observation settles a resize burst, ignores height changes, and cancels on cleanup", async () => {
  const previous = globalThis.ResizeObserver;
  let notify: ResizeObserverCallback;
  let disconnected = false;
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { notify = callback; }
    observe() {}
    disconnect() { disconnected = true; }
    unobserve() {}
  } as typeof ResizeObserver;
  const widths: number[] = [];
  const emit = (width: number, height = 100) =>
    notify([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver);
  const wait = () => new Promise((resolve) => setTimeout(resolve, 30));
  const stop = observeSettledWidth({} as Element, (width) => widths.push(width), 5);
  try {
    emit(400);
    assert.deepEqual(widths, [400]);
    emit(410);
    emit(420);
    emit(430);
    assert.deepEqual(widths, [400]);
    await wait();
    assert.deepEqual(widths, [400, 430]);
    emit(430, 200);
    await wait();
    assert.deepEqual(widths, [400, 430]);
    emit(440);
    stop();
    await wait();
    assert.deepEqual(widths, [400, 430]);
    assert.equal(disconnected, true);
  } finally {
    stop();
    globalThis.ResizeObserver = previous;
  }
});
