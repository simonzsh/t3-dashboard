import { afterEach, beforeEach, jest, test } from "bun:test";
import assert from "node:assert/strict";
import type { UsageOverview } from "../../../../shared/api.ts";
import { startUsagePoll, type UsagePatch } from "../../../src/features/dashboard/useUsage.ts";

const overview = (refreshing: boolean, turns = 1): UsageOverview =>
  ({ days: [], thisWeek: { turns }, cost: { status: "ok", detail: null, refreshing } }) as unknown as UsageOverview;
const visible = { hidden: () => false, onChange: () => () => {} };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// Fake timers do not run promise callbacks: this lets pending reads settle.
const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function harness(results: Array<UsageOverview | Error>, force = false) {
  const forces: boolean[] = [];
  const patches: UsagePatch[] = [];
  const read = async (f: boolean) => {
    forces.push(f);
    const next = results.shift()!;
    if (next instanceof Error) throw next;
    return next;
  };
  const stop = startUsagePoll(read, (p) => patches.push(p), force, visible);
  const advance = async (ms: number) => {
    jest.advanceTimersByTime(ms);
    await flush();
  };
  return { forces, patches, stop, advance };
}

test("it reads at once, publishes the value and polls again after a minute", async () => {
  const h = harness([overview(false), overview(false)]);
  await h.advance(0);
  assert.deepEqual(h.patches.map((p) => p.loading), [true, false]);
  assert.equal(h.patches[1]!.usage?.cost.refreshing, false);
  await h.advance(59_999);
  assert.equal(h.forces.length, 1);
  await h.advance(1);
  assert.equal(h.forces.length, 2);
  h.stop();
});

test("it polls every 10 s while T3 still scans", async () => {
  const h = harness([overview(true), overview(false), overview(false)]);
  await h.advance(0);
  await h.advance(10_000);
  assert.equal(h.forces.length, 2);
  await h.advance(10_000);
  assert.equal(h.forces.length, 2, "the scan ended: back to a minute");
  await h.advance(50_000);
  assert.equal(h.forces.length, 3);
  h.stop();
});

test("an error keeps the last good value and the poll goes on; a later read clears it", async () => {
  const h = harness([overview(false, 5), new Error("boom"), overview(false, 6)]);
  await h.advance(0);
  await h.advance(60_000);
  const failed = h.patches.at(-1)!;
  assert.equal(failed.error, "boom");
  assert.equal("usage" in failed, false);
  await h.advance(60_000);
  const ok = h.patches.at(-1)!;
  assert.equal(ok.error, null);
  assert.equal(ok.usage?.thisWeek.turns, 6);
  h.stop();
});

test("only the first read can force a refresh", async () => {
  const h = harness([overview(false), overview(false)], true);
  await h.advance(0);
  await h.advance(60_000);
  assert.deepEqual(h.forces, [true, false]);
  h.stop();
});

test("stopping cancels the next read and drops a late answer", async () => {
  const h = harness([overview(false), overview(false)]);
  h.stop();
  await h.advance(0);
  assert.deepEqual(h.patches.map((p) => p.loading), [true]);
  await h.advance(120_000);
  assert.equal(h.forces.length, 1);
});
