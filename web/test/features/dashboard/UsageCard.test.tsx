import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { LimitsOverview, LimitWindow, ProviderLimits } from "../../../../shared/api.ts";
import { UsageCard } from "../../../src/features/dashboard/UsageCard.tsx";
import type { LimitsState } from "../../../src/features/dashboard/useLimits.ts";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const after = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000).toISOString();

const win = (over: Partial<LimitWindow> = {}): LimitWindow => ({ id: "w", kind: "session", label: "Session", usedPercent: 38, resetsAt: after(131), windowMinutes: 300, ...over });
const provider = (driver: string, windows: LimitWindow[], resetCredits = 0): ProviderLimits => ({ instanceId: driver, driver, name: driver === "codex" ? "Codex" : "Claude", windows, resetCredits, checkedAt: after(-2) });
const state = (over: Partial<LimitsState> = {}): LimitsState => ({
  limits: { supported: true, providers: [], readAt: after(-1) } satisfies LimitsOverview,
  error: null,
  loading: false,
  refresh: () => {},
  ...over,
});
const render = (providers: ProviderLimits[], over: Partial<LimitsState> = {}) =>
  renderToStaticMarkup(<UsageCard state={state({ limits: { supported: true, providers, readAt: after(-1) }, ...over })} now={NOW} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "");

test("providers show Codex first, then Claude, and windows by kind", () => {
  const out = render([
    provider("claudeAgent", [win({ id: "wk", kind: "weekly", label: "Weekly" }), win({ id: "s", label: "Session" })]),
    provider("codex", [win({ id: "c" })], 2),
  ]);
  assert.ok(out.indexOf(">Codex<") < out.indexOf(">Claude<"));
  assert.ok(out.indexOf(">Session<", out.indexOf(">Claude<")) < out.indexOf(">Weekly<"));
  assert.match(out, /class="limits-provider codex"/);
  assert.match(out, /class="limits-provider claude"/);
});

test("a row shows the quota left, the fill, the marker and the pace", () => {
  // 38% used, 131 min left of 300: 62% left, marker at 44%, under pace.
  const out = render([provider("claudeAgent", [win()])]);
  assert.match(out, /<b>62%<\/b> left/);
  assert.match(out, /class="limits-fill" style="width:62%"/);
  assert.match(out, /class="limits-hatch" style="width:38%"/);
  assert.match(out, /class="limits-marker" style="left:44%"/);
  assert.match(out, /aria-label="Headroom left in this window"/);
});

test("a window ahead of the pace shows the faster-spending label", () => {
  const out = render([provider("codex", [win({ usedPercent: 91, resetsAt: after(150) })])]);
  assert.match(out, /aria-label="Spending faster than the window elapses"/);
  assert.match(out, /class="limits-marker" style="left:50%"/);
});

test("the bar has one text label for screen readers", () => {
  const out = render([provider("codex", [win({ usedPercent: 91, resetsAt: after(150) })], 2)]);
  assert.match(out, /role="img" aria-label="Session: 9% left, 50% of the window left, resets in 2h 30m, 2 reset credits banked"/);
});

test("without a reset time there is no hatch, marker, pace or chip", () => {
  const out = render([provider("codex", [win({ resetsAt: null })])]);
  assert.doesNotMatch(out, /limits-hatch|limits-marker|limits-chip|limits-pace/);
  assert.match(out, /limits-fill/);
});

test("a spent window has no fill", () => {
  assert.doesNotMatch(render([provider("codex", [win({ usedPercent: 100 })])]), /limits-fill/);
});

test("the chip shows the reset countdown and the banked credits", () => {
  const out = render([provider("codex", [win({ resetsAt: after(150) })], 2)]);
  assert.match(text(out), /2h 30m·2/);
  assert.match(out, /class="limits-chip"/);
  const none = render([provider("codex", [win({ resetsAt: after(150) })], 0)]);
  assert.doesNotMatch(text(none), /·/);
});

test("the head shows when the oldest check ran", () => {
  assert.match(render([provider("codex", [win()])]), /Checked 2 min ago/);
});

test("an old T3 gets one sentence", () => {
  const out = renderToStaticMarkup(<UsageCard state={state({ limits: { supported: false, providers: [], readAt: after(0) } })} now={NOW} />);
  assert.match(out, /This T3 Code version does not report usage limits\./);
});

test("a supported T3 without any limits says to sign in", () => {
  assert.match(render([]), /No provider reports usage limits\. Sign in to Codex or Claude in T3 Code\./);
});

test("before the first answer there is a skeleton, and a failed first read shows the error", () => {
  const loading = renderToStaticMarkup(<UsageCard state={state({ limits: null })} now={NOW} />);
  assert.match(loading, /aria-busy="true" aria-label="Loading usage limits"/);
  const failed = renderToStaticMarkup(<UsageCard state={state({ limits: null, error: "T3 Code is not running" })} now={NOW} />);
  assert.match(failed, /role="alert">T3 Code is not running/);
  assert.doesNotMatch(failed, /Loading usage limits/);
});

test("a failed refresh keeps the rows and adds the error", () => {
  const out = render([provider("codex", [win()])], { error: "Boom." });
  assert.match(out, /<b>62%<\/b>/);
  assert.match(out, /role="alert">Could not refresh usage limits\. Boom\./);
});
