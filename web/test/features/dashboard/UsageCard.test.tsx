import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { LimitsOverview, LimitWindow, ProviderLimits } from "../../../../shared/api.ts";
import { UsageCard } from "../../../src/features/dashboard/UsageCard.tsx";
import type { ReadState } from "../../../src/features/dashboard/pollRead.ts";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const after = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const win = (over: Partial<LimitWindow> = {}): LimitWindow => ({ id: "w", kind: "session", label: "Session", usedPercent: 38, resetsAt: after(131), windowMinutes: 300, ...over });
const provider = (driver: string, windows: LimitWindow[], resetCredits = 0): ProviderLimits => ({ instanceId: driver, driver, name: driver === "codex" ? "Codex" : "Claude", windows, resetCredits, checkedAt: after(-2) });
const state = (over: Partial<ReadState<LimitsOverview>> = {}): ReadState<LimitsOverview> => ({
  value: { supported: true, providers: [], readAt: after(-1) } satisfies LimitsOverview,
  error: null,
  loading: false,
  refresh: () => {},
  ...over,
});
const render = (providers: ProviderLimits[], over: Partial<ReadState<LimitsOverview>> = {}) =>
  renderToStaticMarkup(<UsageCard state={state({ value: { supported: true, providers, readAt: after(-1) }, ...over })} now={NOW} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "");

test("providers show Codex first, then Claude, and windows by kind", () => {
  const out = render([
    provider("claudeAgent", [win({ id: "wk", kind: "weekly", label: "Weekly" }), win({ id: "s", label: "Session" })]),
    provider("codex", [win({ id: "c" })], 2),
  ]);
  assert.ok(out.indexOf(">Codex<") < out.indexOf(">Claude<"));
  assert.ok(out.indexOf(">Session<", out.indexOf(">Claude<")) < out.indexOf(">Weekly<"));
});

test("a tile shows the percent used, the meter fill, the elapsed tick and the caption", () => {
  // 38% used, 131 min left of 300: tick at 56%, under pace.
  const out = render([provider("claudeAgent", [win()])]);
  assert.match(out, /class="stat-value">38%<span class="limits-used"> used<\/span>/);
  assert.match(out, /class="meter-fill" style="width:38%"/);
  assert.match(out, /class="meter-tick" style="left:56%"/);
  assert.match(out, /class="stat-caption">Resets in 2h 11m · Under pace</);
});

test("the meter colour follows the severity", () => {
  assert.match(render([provider("codex", [win({ usedPercent: 74 })])]), /class="meter ok"/);
  assert.match(render([provider("codex", [win({ usedPercent: 75 })])]), /class="meter warn"/);
  assert.match(render([provider("codex", [win({ usedPercent: 90 })])]), /class="meter danger"/);
});

test("the meter has one text label for screen readers and the same tooltip", () => {
  const out = render([provider("codex", [win({ usedPercent: 91, resetsAt: after(150) })], 2)]);
  const label = "Session: 91% used, 50% of the window elapsed, resets in 2h 30m";
  assert.match(out, new RegExp(`role="img" aria-label="${label}" data-tooltip="${label}"`));
  assert.match(out, /Resets in 2h 30m · Ahead of pace/);
});

test("without a reset time there is no tick and no caption", () => {
  const out = render([provider("codex", [win({ resetsAt: null })])]);
  assert.doesNotMatch(out, /meter-tick|stat-caption/);
  assert.match(out, /meter-fill/);
});

test("the provider head shows the banked reset credits only when there are some", () => {
  assert.match(text(render([provider("codex", [win()], 2)])), /2 reset credits/);
  assert.match(text(render([provider("codex", [win()], 1)])), /1 reset credit(?!s)/);
  assert.doesNotMatch(render([provider("codex", [win()], 0)]), /limits-credits/);
});

test("the head shows when the oldest check ran", () => {
  assert.match(render([provider("codex", [win()])]), /Updated 2 min ago/);
});

test("an old T3 gets one sentence", () => {
  const out = renderToStaticMarkup(<UsageCard state={state({ value: { supported: false, providers: [], readAt: after(0) } })} now={NOW} />);
  assert.match(out, /This T3 Code version does not report usage limits\./);
});

test("a supported T3 without any limits says to sign in", () => {
  assert.match(render([]), /No provider reports usage limits\. Sign in to Codex or Claude in T3 Code\./);
});

test("before the first answer there is a skeleton, and a failed first read shows the error", () => {
  const loading = renderToStaticMarkup(<UsageCard state={state({ value: null })} now={NOW} />);
  assert.match(loading, /aria-busy="true" aria-label="Loading usage limits"/);
  const failed = renderToStaticMarkup(<UsageCard state={state({ value: null, error: "T3 Code is not running" })} now={NOW} />);
  assert.match(failed, /role="alert">T3 Code is not running/);
  assert.doesNotMatch(failed, /Loading usage limits/);
});

test("a failed refresh keeps the rows and adds the error", () => {
  const out = render([provider("codex", [win()])], { error: "Boom." });
  assert.match(out, /38%/);
  assert.match(out, /role="alert">Could not refresh usage limits\. Boom\./);
});
