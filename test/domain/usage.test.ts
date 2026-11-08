import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DashboardThread } from "../../shared/api.ts";
import type { UsageOverview, UsageTotals } from "../../shared/api.ts";
import { createUsage } from "../../src/domain/usage.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { RawProjection } from "../../src/integrations/t3/schemas.ts";
import { FakePort } from "../helpers/fakePort.ts";

const MINUTE = 60_000;

// The sum of a field over the window.
const totalOf = (overview: UsageOverview, key: keyof UsageTotals) => overview.days.reduce((n, day) => n + day[key], 0);

function thread(id: string, lastActivityAt: string): DashboardThread {
  return { id, projectId: "p", title: id, provider: "claude", model: null, status: "idle", settled: false, pending: null, activeRunId: null, backgroundWork: false, pendingTasks: false, lastError: null, pinned: false, lastActivityAt, branch: null, pullRequest: null };
}

const runs = (...startedAt: string[]): RawProjection => ({ runs: startedAt.map((at, index) => ({ id: `r${index}`, startedAt: at })) });

function setup(threads: DashboardThread[] = [], start = "2026-11-06T12:00:00Z") {
  const port = new FakePort();
  let clock = new Date(start).getTime();
  const state = { threads };
  const usage = createUsage({ port, threads: () => state.threads, now: () => new Date(clock) });
  return { port, usage, state, tick: (ms: number) => (clock += ms) };
}

test("gives 14 zero-filled days, oldest first, ending today", async () => {
  const { usage } = setup();
  const overview = await usage.get("UTC", 7, false);
  assert.equal(overview.days.length, 14);
  assert.equal(overview.days[0]!.day, "2026-10-24");
  assert.equal(overview.days[13]!.day, "2026-11-06");
  assert.ok(overview.days.every((day) => day.turns === 0 && day.costUsd === 0 && day.inputTokens === 0));
  assert.equal(overview.readAt, "2026-11-06T12:00:00.000Z");
});

test("asks T3 for the 14 local days of the zone", async () => {
  const { port, usage } = setup([], "2026-11-06T23:30:00Z");
  await usage.get("Asia/Tokyo", 7, false);
  assert.deepEqual(port.usageCalls, [{ sinceDay: "2026-10-25", untilDay: "2026-11-07", timeZone: "Asia/Tokyo" }]);
});

test("covers twice the period, with T3 asked for the same days", async () => {
  for (const [period, first] of [[7, "2026-10-24"], [30, "2026-09-08"], [90, "2026-05-11"]] as const) {
    const { port, usage } = setup();
    const overview = await usage.get("UTC", period, false);
    assert.equal(overview.period, period);
    assert.equal(overview.days.length, 2 * period);
    assert.equal(overview.days[0]!.day, first);
    assert.equal(overview.days.at(-1)!.day, "2026-11-06");
    assert.deepEqual(port.usageCalls, [{ sinceDay: first, untilDay: "2026-11-06", timeZone: "UTC" }]);
  }
});

test("splits totals and sessions at the period, and reads a thread active only in the previous period", async () => {
  const { port, usage } = setup([thread("a", "2026-10-20T10:00:00Z"), thread("b", "2026-11-06T10:00:00Z")]);
  port.projections = { a: runs("2026-10-20T09:00:00Z"), b: runs("2026-11-06T09:00:00Z", "2026-10-08T09:00:00Z", "2026-10-07T09:00:00Z") };
  port.usage = { buckets: [{ day: "2026-10-08", costUsd: 3 }, { day: "2026-10-07", costUsd: 5 }, { day: "2026-09-08", costUsd: 7 }] };
  const overview = await usage.get("UTC", 30, false);
  // The current period starts on 2026-10-08.
  assert.deepEqual([overview.current.turns, overview.previous.turns], [3, 1]);
  assert.deepEqual([overview.current.costUsd, overview.previous.costUsd], [3, 12]);
  assert.deepEqual(overview.sessions, { current: 2, previous: 1 });
});

test("keeps run times when the period changes", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T10:00:00Z")]);
  port.projection = runs("2026-11-06T09:00:00Z");
  await usage.get("UTC", 90, false);
  await usage.get("UTC", 7, false);
  await usage.get("UTC", 90, true);
  assert.equal(port.projectionCalls, 1);
});

test("counts a run on its local day, across midnight", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T16:30:00Z")], "2026-11-06T16:45:00Z");
  // 16:30Z is 01:30 on the 7th in Tokyo, still the 6th in UTC.
  port.projection = runs("2026-11-06T16:30:00Z");
  const tokyo = await usage.get("Asia/Tokyo", 7, false);
  assert.equal(tokyo.days.at(-1)!.day, "2026-11-07");
  assert.equal(tokyo.days.at(-1)!.turns, 1);
  const utc = await usage.get("UTC", 7, false);
  assert.equal(utc.days.at(-1)!.day, "2026-11-06");
  assert.equal(utc.days.at(-1)!.turns, 1);
});

test("counts runs per day, takes startedAt, then requestedAt, then createdAt, and ignores runs outside the window", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T10:00:00Z")]);
  port.projection = {
    runs: [
      { id: "1", startedAt: "2026-11-06T09:00:00Z", requestedAt: "2026-11-01T09:00:00Z" },
      { id: "2", requestedAt: "2026-11-05T09:00:00Z", createdAt: "2026-11-01T09:00:00Z" },
      { id: "3", createdAt: "2026-11-05T10:00:00Z" },
      { id: "4", startedAt: "2026-10-23T23:59:00Z" },
      { id: "5", startedAt: "2026-11-07T00:00:00Z" },
      { id: "6" },
    ],
  };
  const overview = await usage.get("UTC", 7, false);
  const turns = Object.fromEntries(overview.days.filter((day) => day.turns > 0).map((day) => [day.day, day.turns]));
  assert.deepEqual(turns, { "2026-11-05": 2, "2026-11-06": 1 });
  assert.equal(totalOf(overview, "turns"), 3);
});

test("counts only threads active in the window", async () => {
  const { port, usage } = setup([thread("recent", "2026-11-06T10:00:00Z"), thread("old", "2026-10-01T10:00:00Z")]);
  port.projections = { recent: runs("2026-11-06T09:00:00Z"), old: runs("2026-11-06T08:00:00Z") };
  const overview = await usage.get("UTC", 7, false);
  assert.equal(totalOf(overview, "turns"), 1);
  assert.equal(port.projectionCalls, 1);
});

test("sums cost and tokens per day and splits the two periods", async () => {
  const { port, usage } = setup();
  const bucket = (day: string, costUsd: number, uncached: number, cached: number, creation: number, output: number) => ({
    day,
    costUsd,
    costSource: "modelPriced",
    unpricedRecords: 0,
    totals: { uncachedInputTokens: uncached, cachedInputTokens: cached, cacheCreationTokens: creation, outputTokens: output },
  });
  port.usage = {
    buckets: [
      bucket("2026-11-06", 1.5, 100, 200, 50, 10),
      bucket("2026-11-06", 0.5, 1, 2, 3, 4),
      bucket("2026-10-31", 2, 10, 0, 0, 5),
      bucket("2026-10-30", 4, 20, 20, 0, 7),
      bucket("2026-10-24", 8, 1, 1, 1, 1),
    ],
  };
  const overview = await usage.get("UTC", 7, false);
  assert.deepEqual(overview.days.at(-1), { day: "2026-11-06", turns: 0, costUsd: 2, inputTokens: 356, cachedInputTokens: 202, outputTokens: 14 });
  assert.equal(overview.days.find((day) => day.day === "2026-10-31")!.costUsd, 2);
  assert.deepEqual(overview.current, { turns: 0, costUsd: 4, inputTokens: 366, cachedInputTokens: 202, outputTokens: 19 });
  assert.deepEqual(overview.previous, { turns: 0, costUsd: 12, inputTokens: 43, cachedInputTokens: 21, outputTokens: 8 });
  assert.deepEqual(overview.cost, { status: "ok", detail: null, refreshing: false });
});

test("splits the turns of the two periods", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T10:00:00Z")]);
  port.projection = runs("2026-11-06T09:00:00Z", "2026-11-05T09:00:00Z", "2026-10-30T09:00:00Z", "2026-10-24T09:00:00Z");
  const overview = await usage.get("UTC", 7, false);
  assert.equal(overview.current.turns, 2);
  assert.equal(overview.previous.turns, 2);
  assert.equal(totalOf(overview, "turns"), 4);
});

test("counts a session in each period where it has a turn", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T10:00:00Z"), thread("b", "2026-11-06T10:00:00Z"), thread("c", "2026-11-06T10:00:00Z")]);
  port.projections = {
    a: runs("2026-11-06T09:00:00Z", "2026-11-05T09:00:00Z", "2026-10-30T09:00:00Z"),
    b: runs("2026-10-28T09:00:00Z"),
    c: runs("2026-10-01T09:00:00Z"),
  };
  const overview = await usage.get("UTC", 7, false);
  assert.deepEqual(overview.sessions, { current: 1, previous: 2 });
});

test("ignores buckets outside the window and buckets without a number", async () => {
  const { port, usage } = setup();
  port.usage = { buckets: [{ day: "2026-01-01", costUsd: 9 }, { day: "2026-11-06" }] };
  const overview = await usage.get("UTC", 7, false);
  assert.equal(totalOf(overview, "costUsd"), 0);
  assert.equal(overview.cost.status, "ok");
});

test("an unpriced bucket makes the cost partial", async () => {
  const { port, usage } = setup();
  port.usage = { buckets: [{ day: "2026-11-06", costUsd: 1, costSource: "modelPriced", unpricedRecords: 0 }, { day: "2026-11-06", costUsd: 0, costSource: "unpriced", unpricedRecords: 3 }] };
  const overview = await usage.get("UTC", 7, false);
  assert.equal(overview.cost.status, "partial");
  assert.equal(overview.cost.detail, null);
  assert.equal(totalOf(overview, "costUsd"), 1);
});

test("a missing usage method gives unavailable cost, never an error", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T10:00:00Z")]);
  port.projection = runs("2026-11-06T09:00:00Z");
  port.usageError = new IntegrationError("T3 refused the request: Unknown method", { system: "t3", kind: "refused" });
  const overview = await usage.get("UTC", 7, false);
  assert.deepEqual(overview.cost, { status: "unavailable", detail: "This T3 Code version does not report usage.", refreshing: false });
  assert.equal(totalOf(overview, "costUsd"), 0);
  assert.equal(totalOf(overview, "inputTokens"), 0);
  assert.equal(totalOf(overview, "turns"), 1);
});

test("a protocol error gives the same unavailable detail", async () => {
  const { port, usage } = setup();
  port.usageError = new IntegrationError("Unexpected T3 server.getUsageSummary: buckets should be array, got string", { system: "t3", kind: "protocol" });
  assert.equal((await usage.get("UTC", 7, false)).cost.detail, "This T3 Code version does not report usage.");
});

test("another failure gives its message as the detail", async () => {
  const { port, usage } = setup();
  port.usageError = new IntegrationError("T3 is unreachable", { system: "t3", kind: "unreachable" });
  assert.deepEqual((await usage.get("UTC", 7, false)).cost, { status: "unavailable", detail: "T3 is unreachable", refreshing: false });
  port.usageError = new Error("boom");
  assert.equal((await usage.get("UTC", 7, true)).cost.detail, "boom");
});

test("a failed thread read marks the turns partial and the other threads still count", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T10:00:00Z"), thread("b", "2026-11-06T10:00:00Z")]);
  port.projection = runs("2026-11-06T09:00:00Z");
  port.projectionFailures.add("b");
  const overview = await usage.get("UTC", 7, false);
  assert.equal(overview.turnsPartial, true);
  assert.equal(totalOf(overview, "turns"), 1);
});

test("with T3 offline the overview is still there, with partial turns", async () => {
  const { port, usage } = setup([thread("a", "2026-11-06T10:00:00Z")]);
  port.projectionError = new IntegrationError("T3 is unreachable", { system: "t3", kind: "unreachable" });
  port.usageError = new IntegrationError("T3 is unreachable", { system: "t3", kind: "unreachable" });
  const overview = await usage.get("UTC", 7, false);
  assert.equal(totalOf(overview, "turns"), 0);
  assert.equal(overview.turnsPartial, true);
  assert.equal(overview.cost.status, "unavailable");
});

test("keeps a thread's runs until its activity changes", async () => {
  const { port, usage, state, tick } = setup([thread("a", "2026-11-06T10:00:00Z")]);
  port.projection = runs("2026-11-06T09:00:00Z");
  await usage.get("UTC", 7, false);
  tick(2 * MINUTE);
  await usage.get("UTC", 7, false);
  assert.equal(port.projectionCalls, 1);
  state.threads = [thread("a", "2026-11-06T12:01:00Z")];
  port.projection = runs("2026-11-06T09:00:00Z", "2026-11-06T12:01:00Z");
  const overview = await usage.get("UTC", 7, true);
  assert.equal(port.projectionCalls, 2);
  assert.equal(totalOf(overview, "turns"), 2);
});

test("forgets a thread the dashboard no longer lists", async () => {
  const { port, usage, state } = setup([thread("a", "2026-11-06T10:00:00Z")]);
  port.projection = runs("2026-11-06T09:00:00Z");
  await usage.get("UTC", 7, false);
  state.threads = [];
  assert.equal(totalOf(await usage.get("UTC", 7, true), "turns"), 0);
  state.threads = [thread("a", "2026-11-06T10:00:00Z")];
  await usage.get("UTC", 7, true);
  assert.equal(port.projectionCalls, 2);
});

test("reads at most 8 thread histories at once", async () => {
  const threads = Array.from({ length: 19 }, (_, index) => thread(`t${index}`, "2026-11-06T10:00:00Z"));
  const { port, usage } = setup(threads);
  port.projection = runs("2026-11-06T09:00:00Z");
  port.projectionGate = () => Bun.sleep(5);
  const overview = await usage.get("UTC", 7, false);
  assert.equal(totalOf(overview, "turns"), 19);
  assert.equal(port.peakProjectionsInFlight, 8);
});

test("caches the overview for 10 seconds per zone and period, and refresh skips the cache", async () => {
  const { port, usage, tick } = setup();
  await usage.get("UTC", 7, false);
  tick(9_000);
  await usage.get("UTC", 7, false);
  assert.equal(port.usageCalls.length, 1);
  await usage.get("Europe/Paris", 7, false);
  assert.equal(port.usageCalls.length, 2);
  await usage.get("UTC", 30, false);
  assert.equal(port.usageCalls.length, 3);
  await usage.get("UTC", 7, true);
  assert.equal(port.usageCalls.length, 4);
  tick(10_000);
  await usage.get("Europe/Paris", 7, false);
  assert.equal(port.usageCalls.length, 5);
});

test("calls in flight share one read for the same zone and period only", async () => {
  const { port, usage } = setup();
  const releases: Array<() => void> = [];
  port.usageGate = () => new Promise<void>((resolve) => releases.push(resolve));
  const first = usage.get("UTC", 7, false);
  const second = usage.get("UTC", 7, true);
  const other = usage.get("UTC", 30, false);
  await Bun.sleep(0);
  for (const release of releases) release();
  assert.equal(await first, await second);
  assert.notEqual(await first, await other);
  assert.deepEqual(port.usageCalls.map((call) => call.sinceDay), ["2026-10-24", "2026-09-08"]);
});

test("an unknown zone fails loudly instead of using another one", async () => {
  const { usage } = setup();
  await assert.rejects(usage.get("Mars/Base", 7, false));
});
