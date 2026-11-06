import { test } from "bun:test";
import assert from "node:assert/strict";
import type { UsageOverview } from "../../../../shared/api.ts";
import { startUsagePoll, type UsagePatch } from "../../../src/features/home/usagePoll.ts";

const overview = (refreshing: boolean, turns = 1): UsageOverview =>
  ({ days: [], thisWeek: { turns }, cost: { status: "ok", detail: null, refreshing } }) as unknown as UsageOverview;

// A fake clock: `due` holds the scheduled runs; `fire` runs the oldest one.
function harness(results: Array<UsageOverview | Error>) {
  const forces: boolean[] = [];
  const patches: UsagePatch[] = [];
  const due: Array<{ run: () => void; ms: number; cancelled: boolean }> = [];
  const stop = startUsagePoll(
    {
      read: async (force) => {
        forces.push(force);
        const next = results.shift()!;
        if (next instanceof Error) throw next;
        return next;
      },
      schedule: (run, ms) => {
        const job = { run, ms, cancelled: false };
        due.push(job);
        return () => void (job.cancelled = true);
      },
      emit: (p) => patches.push(p),
    },
    false,
  );
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const fire = async () => {
    const job = due.shift()!;
    if (!job.cancelled) job.run();
    await settle();
  };
  return { forces, patches, due, stop, settle, fire };
}

test("it reads, publishes the value and polls again after a minute", async () => {
  const h = harness([overview(false)]);
  await h.settle();
  assert.deepEqual(h.patches.map((p) => p.loading), [true, false]);
  assert.equal(h.patches[1]!.usage?.cost.refreshing, false);
  assert.equal(h.due[0]!.ms, 60_000);
});

test("it polls every 10 s while T3 still scans", async () => {
  const h = harness([overview(true), overview(false)]);
  await h.settle();
  assert.equal(h.due[0]!.ms, 10_000);
  await h.fire();
  assert.equal(h.due[0]!.ms, 60_000);
});

test("an error keeps the last good value and the poll goes on; a later read clears it", async () => {
  const h = harness([overview(false, 5), new Error("boom"), overview(false, 6)]);
  await h.settle();
  await h.fire();
  const failed = h.patches.at(-1)!;
  assert.equal(failed.error, "boom");
  assert.equal("usage" in failed, false);
  assert.equal(h.due[0]!.ms, 60_000);
  await h.fire();
  const ok = h.patches.at(-1)!;
  assert.equal(ok.error, null);
  assert.equal(ok.usage?.thisWeek.turns, 6);
});

test("only the first read can force a refresh", async () => {
  const forces: boolean[] = [];
  const due: Array<() => void> = [];
  startUsagePoll({ read: async (f) => (forces.push(f), overview(false)), schedule: (run) => (due.push(run), () => {}), emit: () => {} }, true);
  await new Promise((r) => setTimeout(r, 0));
  due.shift()!();
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(forces, [true, false]);
});

test("stopping cancels the next read and drops a late answer", async () => {
  const h = harness([overview(false), overview(false)]);
  await h.settle();
  h.stop();
  assert.equal(h.due[0]!.cancelled, true);
  const count = h.patches.length;
  await h.fire();
  assert.equal(h.patches.length, count);
});
