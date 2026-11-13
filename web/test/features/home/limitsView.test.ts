import assert from "node:assert/strict";
import { test } from "bun:test";
import type { LimitsOverview, LimitWindow, ProviderLimits } from "../../../../shared/api.ts";
import { caption, elapsedPercent, elapsedShare, meterLabel, oldestCheck, pace, resetLabel, sortProviders, sortWindows, usedPercent } from "../../../src/features/home/limitsView.ts";

const NOW = new Date("2026-11-06T12:00:00Z");
const MIN = 60_000;
const after = (minutes: number) => new Date(NOW.getTime() + minutes * MIN).toISOString();

const win = (over: Partial<LimitWindow> = {}): LimitWindow => ({ id: "w", kind: "session", label: "Session", usedPercent: 50, resetsAt: after(150), windowMinutes: 300, ...over });
const provider = (driver: string, checkedAt: string | null = null): ProviderLimits => ({ instanceId: driver, driver, name: driver, windows: [], resetCredits: 0, checkedAt });

test("usedPercent rounds the quota used and clamps", () => {
  assert.equal(usedPercent(win({ usedPercent: 38.6 })), 39);
  assert.equal(usedPercent(win({ usedPercent: 130 })), 100);
  assert.equal(usedPercent(win({ usedPercent: -3 })), 0);
});

test("elapsedShare is the share of the window gone, or null without an end or a length", () => {
  assert.equal(elapsedShare(win({ resetsAt: after(75) }), NOW), 0.75);
  assert.equal(elapsedShare(win({ resetsAt: after(-10) }), NOW), 1);
  assert.equal(elapsedShare(win({ resetsAt: after(400) }), NOW), 0);
  assert.equal(elapsedShare(win({ resetsAt: null }), NOW), null);
  assert.equal(elapsedShare(win({ windowMinutes: null }), NOW), null);
});

test("elapsedPercent is the share of the window gone: 2h 48m left of 5 h is 44", () => {
  assert.equal(elapsedPercent(win({ resetsAt: after(2 * 60 + 48) }), NOW), 44);
  assert.equal(elapsedPercent(win({ kind: "weekly", windowMinutes: 10_080, resetsAt: after(6 * 1440 + 15 * 60) }), NOW), 5);
  assert.equal(elapsedPercent(win({ resetsAt: null }), NOW), null);
});

test("pace compares the used share with the elapsed share, with a strict 5-point band", () => {
  // Half of the window is gone.
  const at = (usedPercent: number) => pace(win({ usedPercent }), NOW);
  assert.equal(at(55.5), "ahead");
  assert.equal(at(55), "on");
  assert.equal(at(45), "on");
  assert.equal(at(44.5), "under");
  assert.equal(pace(win({ resetsAt: null }), NOW), null);
});

test("resetLabel", () => {
  assert.equal(resetLabel(null, NOW), null);
  assert.equal(resetLabel(after(0), NOW), "now");
  assert.equal(resetLabel(after(-5), NOW), "now");
  assert.equal(resetLabel(new Date(NOW.getTime() + 30_000).toISOString(), NOW), "<1m");
  assert.equal(resetLabel(after(48), NOW), "48m");
  assert.equal(resetLabel(after(2 * 60 + 11), NOW), "2h 11m");
  assert.equal(resetLabel(after(4 * 1440 + 3 * 60 + 59), NOW), "4d 3h");
});

test("sortWindows orders by kind and keeps T3's order within a kind", () => {
  const sorted = sortWindows([win({ id: "o", kind: "other" }), win({ id: "w1", kind: "weekly" }), win({ id: "s", kind: "session" }), win({ id: "m", kind: "monthly" }), win({ id: "w2", kind: "weekly" })]);
  assert.deepEqual(sorted.map((w) => w.id), ["s", "w1", "w2", "m", "o"]);
});

test("sortProviders puts Codex first, then Claude, then the known kinds by label, then the rest by name", () => {
  const sorted = sortProviders([provider("zed"), provider("opencode"), provider("claudeAgent"), provider("cursor"), provider("codex"), provider("kiro")]);
  assert.deepEqual(sorted.map((p) => p.driver), ["codex", "claudeAgent", "cursor", "opencode", "kiro", "zed"]);
});

test("oldestCheck uses the earliest provider check, else the read time", () => {
  const overview = (providers: ProviderLimits[]): LimitsOverview => ({ supported: true, providers, readAt: after(0) });
  assert.equal(oldestCheck(overview([provider("a", after(-1)), provider("b", after(-30))]), NOW), "Updated 30 min ago");
  assert.equal(oldestCheck(overview([provider("a")]), NOW), "Updated just now");
});

test("caption joins the reset countdown and the pace, and omits unknown parts", () => {
  assert.equal(caption(win({ usedPercent: 91, resetsAt: after(150) }), NOW), "Resets in 2h 30m · Ahead of pace");
  assert.equal(caption(win({ usedPercent: 50, resetsAt: after(150) }), NOW), "Resets in 2h 30m · On pace");
  assert.equal(caption(win({ usedPercent: 10, resetsAt: after(150) }), NOW), "Resets in 2h 30m · Under pace");
  assert.equal(caption(win({ usedPercent: 40, resetsAt: after(0) }), NOW), "Resets now · Under pace");
  assert.equal(caption(win({ resetsAt: null }), NOW), "");
});

test("meterLabel lists the quota used, the window elapsed and the reset", () => {
  const weekly = win({ label: "Weekly", kind: "weekly", usedPercent: 69, windowMinutes: 10_080, resetsAt: after(4 * 1440 + 15 * 60) });
  assert.equal(meterLabel(weekly, NOW), "Weekly: 69% used, 34% of the window elapsed, resets in 4d 15h");
  assert.equal(meterLabel(win({ label: "Session", usedPercent: 40, resetsAt: null }), NOW), "Session: 40% used");
});
