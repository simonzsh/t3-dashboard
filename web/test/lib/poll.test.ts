import { test } from "bun:test";
import assert from "node:assert/strict";
import { startPoll } from "../../src/lib/usePoll.ts";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test("startPoll waits one delay, then calls again only after each call ends", async () => {
  const starts: number[] = [];
  let running = 0;
  let overlap = false;
  const begin = Date.now();
  const stop = startPoll(async () => {
    overlap ||= running > 0;
    running++;
    starts.push(Date.now() - begin);
    await wait(15);
    running--;
  }, 10);
  await wait(90);
  stop();
  assert.ok(starts.length >= 2 && starts.length <= 4, `calls: ${starts.length}`);
  assert.ok(starts[0]! >= 9, "the first call waits one delay");
  assert.equal(overlap, false);
});

test("stop ends the loop, even during a call", async () => {
  let calls = 0;
  const stop = startPoll(async () => {
    calls++;
    await wait(20);
  }, 5);
  await wait(10);
  stop();
  await wait(60);
  assert.equal(calls, 1);
});

test("a call that throws does not end the loop", async () => {
  let calls = 0;
  const stop = startPoll(async () => {
    calls++;
    throw new Error("boom");
  }, 5);
  await wait(40);
  stop();
  assert.ok(calls >= 2, `calls: ${calls}`);
});

function fakePage(hidden: boolean) {
  const state = { hidden, listeners: new Set<() => void>() };
  return {
    state,
    page: {
      hidden: () => state.hidden,
      onChange: (cb: () => void) => {
        state.listeners.add(cb);
        return () => void state.listeners.delete(cb);
      },
    },
    set(value: boolean) {
      state.hidden = value;
      for (const cb of [...state.listeners]) cb();
    },
  };
}

test("a hidden page skips the call and stops the loop, then catches up at once when visible", async () => {
  const fake = fakePage(true);
  let calls = 0;
  const stop = startPoll(async () => void calls++, 5, fake.page);
  await wait(30);
  assert.equal(calls, 0);
  fake.set(false);
  assert.equal(calls, 1, "immediate catch-up call");
  await wait(30);
  assert.ok(calls >= 2, `calls: ${calls}`);
  stop();
});

test("showing the page before a tick was skipped adds no extra call", async () => {
  const fake = fakePage(false);
  let calls = 0;
  const stop = startPoll(async () => void calls++, 50, fake.page);
  fake.set(true);
  fake.set(false);
  assert.equal(calls, 0);
  stop();
});

test("stop removes the visibility listener", () => {
  const fake = fakePage(false);
  const stop = startPoll(async () => {}, 5, fake.page);
  assert.equal(fake.state.listeners.size, 1);
  stop();
  assert.equal(fake.state.listeners.size, 0);
});
