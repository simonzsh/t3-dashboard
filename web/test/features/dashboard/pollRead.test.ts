import { afterEach, beforeEach, jest, test } from "bun:test";
import assert from "node:assert/strict";
import { startReadPoll, type ReadPatch } from "../../../src/features/dashboard/pollRead.ts";

interface Value {
  id: string;
}
const visible = { hidden: () => false, onChange: () => () => {} };
const MINUTE = 60_000;

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// Fake timers do not run promise callbacks: this lets pending reads settle.
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function harness(results: Array<Value | Error>, force = false, page = visible) {
  const forces: boolean[] = [];
  const patches: ReadPatch<Value>[] = [];
  const read = async (f: boolean) => {
    forces.push(f);
    const next = results.shift()!;
    if (next instanceof Error) throw next;
    return next;
  };
  const stop = startReadPoll(read, (p) => patches.push(p), force, page);
  const advance = async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await flush();
  };
  return { forces, patches, stop, advance };
}

test("it reads at once, publishes the value and polls again after the delay", async () => {
  const h = harness([{ id: "a" }, { id: "b" }]);
  await h.advance(0);
  assert.deepEqual(h.patches.map((p) => p.loading), [true, false]);
  assert.equal(h.patches[1]!.value?.id, "a");
  await h.advance(59_999);
  assert.equal(h.forces.length, 1);
  await h.advance(1);
  assert.equal(h.forces.length, 2);
  h.stop();
});

test("an error keeps the last good value and the poll goes on; a later read clears it", async () => {
  const h = harness([{ id: "a" }, new Error("boom"), { id: "c" }]);
  await h.advance(0);
  await h.advance(MINUTE);
  const failed = h.patches.at(-1)!;
  assert.equal(failed.error, "boom");
  assert.equal("value" in failed, false);
  await h.advance(MINUTE);
  const ok = h.patches.at(-1)!;
  assert.equal(ok.error, null);
  assert.equal(ok.value?.id, "c");
  h.stop();
});

test("only the first read can force a refresh", async () => {
  const h = harness([{ id: "a" }, { id: "b" }], true);
  await h.advance(0);
  await h.advance(MINUTE);
  assert.deepEqual(h.forces, [true, false]);
  h.stop();
});

test("a hidden page makes no read", async () => {
  const h = harness([{ id: "a" }, { id: "b" }], false, { hidden: () => true, onChange: () => () => {} });
  await h.advance(0);
  await h.advance(180_000);
  assert.equal(h.forces.length, 1);
  h.stop();
});

test("stopping cancels the next read and drops a late answer", async () => {
  const h = harness([{ id: "a" }, { id: "b" }]);
  h.stop();
  await h.advance(0);
  assert.deepEqual(h.patches.map((p) => p.loading), [true]);
  await h.advance(120_000);
  assert.equal(h.forces.length, 1);
});
