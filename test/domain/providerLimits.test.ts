import assert from "node:assert/strict";
import { test } from "bun:test";
import { createProviderLimits, toLimitsOverview } from "../../src/domain/providerLimits.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { RawConfig, RawUsageLimits } from "../../src/integrations/t3/schemas.ts";
import { FakePort } from "../helpers/fakePort.ts";

const NOW = new Date("2026-11-06T12:00:00Z");

const limits = (over: Partial<RawUsageLimits> = {}): RawUsageLimits => ({
  checkedAt: "2026-11-06T11:59:00Z",
  windows: [{ id: "primary", kind: "session", label: "Session", usedPercent: 40, resetsAt: "2026-11-06T14:00:00Z", windowDurationMins: 300 }],
  ...over,
});

test("maps a provider's windows, credits and check time", () => {
  const config: RawConfig = {
    providers: [
      {
        instanceId: "codex",
        driver: "codex",
        displayName: "Codex",
        usageLimits: limits({
          windows: [
            { id: "primary", kind: "session", label: "Session", usedPercent: 40, resetsAt: "2026-11-06T14:00:00Z", windowDurationMins: 300 },
            { id: "secondary", kind: "weekly", usedPercent: 10 },
          ],
          resetCredits: { availableCount: 3.9 },
        }),
      },
    ],
  };
  assert.deepEqual(toLimitsOverview(config, NOW), {
    supported: true,
    readAt: "2026-11-06T12:00:00.000Z",
    providers: [
      {
        instanceId: "codex",
        driver: "codex",
        name: "Codex",
        resetCredits: 3,
        checkedAt: "2026-11-06T11:59:00Z",
        windows: [
          { id: "primary", kind: "session", label: "Session", usedPercent: 40, resetsAt: "2026-11-06T14:00:00Z", windowMinutes: 300 },
          { id: "secondary", kind: "weekly", label: "secondary", usedPercent: 10, resetsAt: null, windowMinutes: null },
        ],
      },
    ],
  });
});

test("clamps the percent, keeps an unknown kind as other, drops a window without a percent", () => {
  const config: RawConfig = {
    providers: [
      {
        instanceId: "x",
        usageLimits: limits({
          windows: [
            { id: "a", kind: "hourly", usedPercent: 130, resetsAt: "not a date", windowDurationMins: 0 },
            { id: "b", kind: "session", usedPercent: -5 },
            { id: "c", kind: "session" },
            { id: "d", kind: "session", usedPercent: null },
          ],
          resetCredits: { availableCount: -2 },
        }),
      },
    ],
  };
  const [provider] = toLimitsOverview(config, NOW).providers;
  assert.deepEqual(provider!.windows.map((w) => [w.id, w.kind, w.usedPercent, w.resetsAt, w.windowMinutes]), [["a", "other", 100, null, null], ["b", "session", 0, null, null]]);
  assert.equal(provider!.name, "x");
  assert.equal(provider!.driver, "x");
  assert.equal(provider!.resetCredits, 0);
});

test("an old T3 without usageLimits is not supported", () => {
  const overview = toLimitsOverview({ providers: [{ instanceId: "codex" }, { instanceId: "claude", usageLimits: null }] }, NOW);
  assert.deepEqual([overview.supported, overview.providers], [false, []]);
  assert.equal(toLimitsOverview({}, NOW).supported, false);
});

test("skips a disabled provider and one without a usable window, but stays supported", () => {
  const overview = toLimitsOverview(
    {
      providers: [
        { instanceId: "off", enabled: false, usageLimits: limits() },
        { instanceId: "none", usageLimits: { checkedAt: "x", windows: [], unavailable: { reason: "unsupported" } } },
        { instanceId: "ok", usageLimits: limits() },
      ],
    },
    NOW,
  );
  assert.deepEqual(overview.providers.map((p) => p.instanceId), ["ok"]);
  assert.equal(overview.supported, true);
  const onlyUnavailable = toLimitsOverview({ providers: [{ instanceId: "none", usageLimits: { windows: [] } }] }, NOW);
  assert.deepEqual([onlyUnavailable.supported, onlyUnavailable.providers], [true, []]);
});

function setup() {
  const port = new FakePort();
  let clock = NOW.getTime();
  const calls = { n: 0 };
  port.config = async () => {
    calls.n++;
    return { providers: [{ instanceId: "codex", usageLimits: limits() }] };
  };
  const reader = createProviderLimits({ port, now: () => new Date(clock) });
  return { port, calls, reader, tick: (ms: number) => (clock += ms) };
}

test("serves a read from the cache for 15 s, then reads again", async () => {
  const { calls, reader, tick } = setup();
  await reader.get(false);
  tick(14_000);
  await reader.get(false);
  assert.equal(calls.n, 1);
  tick(1_000);
  const third = await reader.get(false);
  assert.equal(calls.n, 2);
  assert.equal(third.readAt, "2026-11-06T12:00:15.000Z");
});

test("refresh asks T3 to check the providers, then reads the config", async () => {
  const { port, calls, reader } = setup();
  const order: string[] = [];
  const inner = port.config;
  port.config = async () => (order.push("config"), inner());
  port.refreshProviders = async () => void order.push("refresh");
  await reader.get(false);
  await reader.get(true);
  assert.deepEqual(order, ["config", "refresh", "config"]);
  assert.equal(calls.n, 2);
});

test("a plain read never asks T3 to check the providers", async () => {
  const { port, reader, tick } = setup();
  await reader.get(false);
  tick(60_000);
  await reader.get(false);
  assert.equal(port.refreshCalls, 0);
});

test("reads in flight are shared, refresh included", async () => {
  const { port, calls, reader } = setup();
  let release = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const inner = port.config;
  port.config = async () => (await gate, inner());
  const first = reader.get(true);
  const second = reader.get(true);
  release();
  assert.equal(await first, await second);
  assert.equal(calls.n, 1);
  assert.equal(port.refreshCalls, 1);
});

test("a refresh that fails still reads the config, then passes the error on", async () => {
  const { port, calls, reader } = setup();
  port.refreshProviders = async () => {
    throw new IntegrationError("T3 could not check", { system: "t3", kind: "unreachable" });
  };
  await assert.rejects(reader.get(true), /T3 could not check/);
  assert.equal(calls.n, 1);
});

test("a failed read is not cached and passes its error on", async () => {
  const { port, reader } = setup();
  const good = port.config;
  port.config = async () => {
    throw new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" });
  };
  await assert.rejects(reader.get(false), /T3 is down/);
  port.config = good;
  assert.equal((await reader.get(false)).providers.length, 1);
});
