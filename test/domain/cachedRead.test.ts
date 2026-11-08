import assert from "node:assert/strict";
import { test } from "bun:test";
import { cachedRead } from "../../src/domain/cachedRead.ts";

function setup(ttlMs = 1000) {
  let clock = 0;
  let calls = 0;
  let fails = false;
  const gates: Array<() => void> = [];
  let hold = false;
  const read = async () => {
    const n = ++calls;
    if (hold) await new Promise<void>((resolve) => gates.push(resolve));
    if (fails) throw new Error("boom");
    return n;
  };
  const cell = cachedRead(read, { ttlMs, now: () => clock });
  return {
    cell,
    calls: () => calls,
    tick: (ms: number) => (clock += ms),
    fail: (on: boolean) => (fails = on),
    hold: (on: boolean) => (hold = on),
    release: () => gates.splice(0).forEach((open) => open()),
  };
}

test("a value is kept for the TTL, then read again", async () => {
  const { cell, calls, tick } = setup();
  assert.equal(await cell.get(), 1);
  tick(999);
  assert.equal(await cell.get(), 1);
  tick(1);
  assert.equal(await cell.get(), 2);
  assert.equal(calls(), 2);
});

test("concurrent gets share one read", async () => {
  const { cell, calls, hold, release } = setup();
  hold(true);
  const all = Promise.all([cell.get(), cell.get()]);
  release();
  assert.deepEqual(await all, [1, 1]);
  assert.equal(calls(), 1);
});

test("a fresh get does not join a read started before it, and keeps its own value", async () => {
  const { cell, calls, hold, release } = setup();
  hold(true);
  const old = cell.get();
  const fresh = cell.get(true);
  const joined = cell.get();
  release();
  assert.deepEqual(await Promise.all([old, fresh, joined]), [1, 2, 2]);
  assert.equal(calls(), 2);
  hold(false);
  assert.equal(await cell.get(), 2);
  assert.equal(calls(), 2);
});

test("a fresh get skips the kept value", async () => {
  const { cell, calls } = setup();
  await cell.get();
  assert.equal(await cell.get(true), 2);
  assert.equal(calls(), 2);
});

test("invalidate during a read starts a new read, and the old one is not stored", async () => {
  const { cell, calls, hold, release } = setup();
  hold(true);
  const old = cell.get();
  cell.invalidate();
  const next = cell.get();
  assert.equal(calls(), 2);
  release();
  assert.equal(await old, 1);
  assert.equal(await next, 2);
  hold(false);
  assert.equal(await cell.get(), 2);
  assert.equal(calls(), 2);
});

test("a failure is not kept", async () => {
  const { cell, calls, fail } = setup();
  fail(true);
  await assert.rejects(cell.get(), /boom/);
  fail(false);
  assert.equal(await cell.get(), 2);
  assert.equal(calls(), 2);
});

test("a TTL of zero only shares a read in flight", async () => {
  const { cell, calls, hold, release } = setup(0);
  hold(true);
  const both = Promise.all([cell.get(), cell.get()]);
  release();
  await both;
  hold(false);
  assert.equal(calls(), 1);
  assert.equal(await cell.get(), 2);
});
