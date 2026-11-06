import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { UsageDay, UsageOverview, UsageTotals } from "../../../../shared/api.ts";
import { DashboardView } from "../../../src/features/dashboard/DashboardView.tsx";
import { DEFAULT_LAYOUT, moveCard, setHidden, type DashboardLayout } from "../../../src/features/dashboard/layout.ts";
import type { UsageState } from "../../../src/features/dashboard/useUsage.ts";
import { thread } from "../../fixtures.ts";

const NOW = new Date("2026-01-14T12:00:00.000Z");
const days: UsageDay[] = Array.from({ length: 14 }, (_, i) => ({
  day: `2026-01-${String(i + 1).padStart(2, "0")}`,
  turns: i < 7 ? 7 : 9,
  costUsd: 0.5,
  inputTokens: 1000,
  cachedInputTokens: 750,
  outputTokens: 200,
}));
const totals = (list: UsageDay[]): UsageTotals => ({
  turns: list.reduce((n, d) => n + d.turns, 0),
  costUsd: list.reduce((n, d) => n + d.costUsd, 0),
  inputTokens: list.reduce((n, d) => n + d.inputTokens, 0),
  cachedInputTokens: list.reduce((n, d) => n + d.cachedInputTokens, 0),
  outputTokens: list.reduce((n, d) => n + d.outputTokens, 0),
});
const overview = (over: Partial<UsageOverview> = {}): UsageOverview => ({
  timeZone: "UTC",
  days,
  thisWeek: totals(days.slice(7)),
  lastWeek: totals(days.slice(0, 7)),
  total: totals(days),
  activeThreads: 13,
  sessions: { thisWeek: 9, lastWeek: 6, total: 13 },
  turnsPartial: false,
  cost: { status: "ok", detail: null, refreshing: false },
  readAt: "2026-01-14T11:59:00.000Z",
  ...over,
});
const state = (over: Partial<UsageState> = {}): UsageState => ({ usage: overview(), error: null, loading: false, refresh: () => {}, ...over });
const cards = {
  notifications: <div id="card-notifications">N</div>,
  running: <div id="card-running">R</div>,
  "up-next": <div id="card-up-next">U</div>,
};
const render = (s: UsageState, threads = [thread("a", { status: "running" })], layout: DashboardLayout = DEFAULT_LAYOUT, editing = false) =>
  renderToStaticMarkup(<DashboardView usage={s} threads={threads} now={NOW} layout={layout} cards={cards} editing={editing} />);

test("the three tiles cover the last 7 days, each with its change", () => {
  const out = render(state());
  // 63 turns this week against 49 the week before.
  assert.match(out, /Turns<\/span><span class="stat-value">63<span class="stat-delta">\+29 %/);
  assert.match(out, /messages sent to agents · last 7 days/);
  assert.match(out, /Sessions<\/span><span class="stat-value">9<span class="stat-delta">\+50 %/);
  assert.match(out, /1 running · last 7 days/);
  assert.match(out, /Spend \(API equiv\.\)<\/span><span class="stat-value">\$[\d.]+<span class="stat-delta">/);
  assert.match(out, /last 7 days · all usage on this machine/);
  assert.doesNotMatch(out, /last 14 days ·/);
});

test("a partial turn count and unpriced models are said in the captions", () => {
  const out = render(state({ usage: overview({ turnsPartial: true, cost: { status: "partial", detail: null, refreshing: false } }) }));
  assert.match(out, /last 7 days \(partial\)/);
  assert.match(out, /last 7 days · some models unpriced · all usage on this machine/);
});

test("unavailable cost shows a dash and T3's reason, and does not crash", () => {
  const out = render(state({ usage: overview({ cost: { status: "unavailable", detail: "This T3 Code version does not report usage.", refreshing: false } }) }));
  assert.match(out, /Spend \(API equiv\.\)<\/span><span class="stat-value">—</);
  assert.match(out, /This T3 Code version does not report usage\./);
});

test("the chart has one labelled bar slot per day, today last, and a table for screen readers", () => {
  const out = render(state());
  assert.equal(out.match(/class="usage-hit"/g)?.length, 14);
  assert.match(out, /Jan 14: 9 turns, \$0\.50, 1\.2k tokens/);
  assert.match(out, />Today</);
  assert.match(out, /<table class="sr-only">/);
});

test("the default layout puts usage, Running and Up next left and Notifications right", () => {
  const out = render(state());
  const right = out.indexOf('class="dashboard-col right pinned"');
  assert.ok(right > 0);
  assert.ok(out.indexOf('id="dashboard-usage-head"') < out.indexOf('id="card-running"'));
  assert.ok(out.indexOf('id="card-running"') < out.indexOf('id="card-up-next"'));
  assert.ok(out.indexOf('id="card-up-next"') < right);
  assert.ok(right < out.indexOf('id="card-notifications"'));
});

test("the right column is pinned only while it holds Notifications alone", () => {
  assert.doesNotMatch(render(state(), undefined, moveCard(DEFAULT_LAYOUT, "running", "right")), /dashboard-col right pinned/);
});

test("the Today and Needs you cards are gone", () => {
  const out = render(state());
  assert.doesNotMatch(out, /aria-label="Today"|aria-label="Needs you"/);
});

test("a moved card follows the layout, and a hidden card is not drawn", () => {
  const moved = render(state(), undefined, moveCard(DEFAULT_LAYOUT, "running", "right", 0));
  assert.ok(moved.indexOf('class="dashboard-col right"') < moved.indexOf('id="card-running"'));
  assert.ok(moved.indexOf('id="card-running"') < moved.indexOf('id="card-notifications"'));
  const hidden = render(state(), undefined, setHidden(DEFAULT_LAYOUT, "running", true));
  assert.doesNotMatch(hidden, /card-running/);
});

test("each slot carries its place for the one-column layout", () => {
  const out = render(state());
  assert.match(out, /dashboard-slot notifications" style="--stack:1"/);
  assert.match(out, /dashboard-slot running" style="--stack:2"/);
});

test("before the first answer Dashboard shows a skeleton, with the live cards already there", () => {
  const out = render(state({ usage: null }));
  assert.match(out, /class="skeleton"[^>]*aria-hidden/);
  assert.match(out, /aria-busy="true" aria-label="Loading usage"/);
  assert.match(out, /id="card-notifications"/);
  assert.doesNotMatch(out, /stat-value/);
});

test("a failed first read shows the error line", () => {
  assert.match(render(state({ usage: null, error: "Cannot reach the dashboard server." })), /role="alert">Cannot reach/);
});

test("a failed refresh keeps the last numbers and adds the error", () => {
  const out = render(state({ error: "Boom." }));
  assert.match(out, /stat-value">63/);
  assert.match(out, /Could not refresh usage\. Boom\./);
});

test("without data it shows a skeleton, and an error when the read failed", () => {
  assert.match(render(state({ usage: null })), /class="skeleton/);
  const failed = render(state({ usage: null, error: "T3 is down" }));
  assert.match(failed, /role="alert">T3 is down/);
  assert.doesNotMatch(failed, /class="skeleton/);
});

test("a failed refresh keeps the last good data and shows the error", () => {
  const out = render(state({ error: "offline" }));
  assert.match(out, /Could not refresh usage\. offline/);
  assert.match(out, /stat-value">63/);
});

test("without edit mode there is no edit bar", () => {
  assert.doesNotMatch(render(state()), /card-edit-bar|inert/);
});

test("edit mode shows a bar with a drag handle and the move buttons on every card, and locks the card", () => {
  const out = render(state(), undefined, DEFAULT_LAYOUT, true);
  assert.equal(out.match(/class="card-edit-bar"/g)?.length, 4);
  assert.equal(out.match(/class="card-edit-bar" draggable="true"/g)?.length, 4);
  assert.match(out, /aria-label="Move Running to the right column"/);
  assert.match(out, /aria-label="Move Notifications to the left column"/);
  assert.match(out, /aria-label="Hide Up next"/);
  assert.equal(out.match(/class="dashboard-slot-body" inert=""/g)?.length, 4);
});

test("the first card of a column cannot move up and the last cannot move down", () => {
  const out = render(state(), undefined, DEFAULT_LAYOUT, true);
  assert.match(out, /<button disabled=""[^>]*aria-label="Move Usage up"/);
  assert.match(out, /<button disabled=""[^>]*aria-label="Move Up next down"/);
  assert.doesNotMatch(out, /<button disabled=""[^>]*aria-label="Move Running up"/);
});

test("edit mode lists hidden cards so they can be shown again", () => {
  const out = render(state(), undefined, setHidden(DEFAULT_LAYOUT, "running", true), true);
  assert.match(out, /Hidden cards/);
  assert.match(out, /Show Running/);
  assert.doesNotMatch(render(state(), undefined, setHidden(DEFAULT_LAYOUT, "running", true)), /Hidden cards/);
});

test("the usage card has a header like the other cards, with the update time and refresh", () => {
  const out = render(state());
  assert.match(out, /class="card-head"><svg[^]*?<h2 id="dashboard-usage-head">Usage<\/h2><span class="card-actions"><span class="usage-updated">Updated [^<]+<\/span>[^]*?aria-label="Refresh usage"/);
  assert.match(render(state({ usage: null })), /<h2 id="dashboard-usage-head">Usage<\/h2>/);
});
