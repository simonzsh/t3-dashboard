import assert from "node:assert/strict";
import { test } from "bun:test";
import type { LimitsOverview, LimitWindow, ProviderLimits } from "../../../../shared/api.ts";
import { elapsedShare, leftPercent, oldestCheck, pace, resetLabel, rowLabel, showHatch, sortProviders, sortWindows, timeLeftPercent } from "../../../src/features/dashboard/limitsView.ts";

const NOW = new Date("2026-11-06T12:00:00Z");
const MIN = 60_000;
const after = (minutes: number) => new Date(NOW.getTime() + minutes * MIN).toISOString();

const win = (over: Partial<LimitWindow> = {}): LimitWindow => ({ id: "w", kind: "session", label: "Session", usedPercent: 50, resetsAt: after(150), windowMinutes: 300, ...over });
const provider = (driver: string, checkedAt: string | null = null): ProviderLimits => ({ instanceId: driver, driver, name: driver, windows: [], resetCredits: 0, checkedAt });

test("leftPercent rounds the quota left and clamps", () => {
  assert.equal(leftPercent(win({ usedPercent: 38.6 })), 61);
  assert.equal(leftPercent(win({ usedPercent: 130 })), 0);
  assert.equal(leftPercent(win({ usedPercent: -3 })), 100);
});

test("elapsedShare is the share of the window gone, or null without an end or a length", () => {
  assert.equal(elapsedShare(win({ resetsAt: after(75) }), NOW), 0.75);
  assert.equal(elapsedShare(win({ resetsAt: after(-10) }), NOW), 1);
  assert.equal(elapsedShare(win({ resetsAt: after(400) }), NOW), 0);
  assert.equal(elapsedShare(win({ resetsAt: null }), NOW), null);
  assert.equal(elapsedShare(win({ windowMinutes: null }), NOW), null);
});

test("timeLeftPercent matches the T3 panel: 2h 48m left of 5 h is 56, 6d 15h left of 7 d is 95", () => {
  assert.equal(timeLeftPercent(win({ resetsAt: after(2 * 60 + 48) }), NOW), 56);
  assert.equal(timeLeftPercent(win({ kind: "weekly", windowMinutes: 10_080, resetsAt: after(6 * 1440 + 15 * 60) }), NOW), 95);
  assert.equal(timeLeftPercent(win({ resetsAt: null }), NOW), null);
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

test("the hatch needs a used part and a reset time", () => {
  assert.equal(showHatch(win({ usedPercent: 10 })), true);
  assert.equal(showHatch(win({ usedPercent: 0 })), false);
  assert.equal(showHatch(win({ resetsAt: null })), false);
});

test("sortWindows orders by kind and keeps T3's order within a kind", () => {
  const sorted = sortWindows([win({ id: "o", kind: "other" }), win({ id: "w1", kind: "weekly" }), win({ id: "s", kind: "session" }), win({ id: "m", kind: "monthly" }), win({ id: "w2", kind: "weekly" })]);
  assert.deepEqual(sorted.map((w) => w.id), ["s", "w1", "w2", "m", "o"]);
});

test("sortProviders puts Codex first, then Claude, then the rest", () => {
  const sorted = sortProviders([provider("cursor"), provider("claudeAgent"), provider("codex"), provider("opencode")]);
  assert.deepEqual(sorted.map((p) => p.driver), ["codex", "claudeAgent", "cursor", "opencode"]);
});

test("oldestCheck uses the earliest provider check, else the read time", () => {
  const overview = (providers: ProviderLimits[]): LimitsOverview => ({ supported: true, providers, readAt: after(0) });
  assert.equal(oldestCheck(overview([provider("a", after(-1)), provider("b", after(-30))]), NOW), "Checked 30 min ago");
  assert.equal(oldestCheck(overview([provider("a")]), NOW), "Checked just now");
});

test("rowLabel lists the quota, window left, reset and credits", () => {
  const weekly = win({ label: "Weekly", kind: "weekly", usedPercent: 69, windowMinutes: 10_080, resetsAt: after(4 * 1440 + 15 * 60) });
  assert.equal(rowLabel(weekly, 3, NOW), "Weekly: 31% left, 66% of the window left, resets in 4d 15h, 3 reset credits banked");
  assert.equal(rowLabel(weekly, 1, NOW).endsWith("1 reset credit banked"), true);
  assert.equal(rowLabel(win({ label: "Session", usedPercent: 40, resetsAt: null }), 0, NOW), "Session: 60% left");
});
