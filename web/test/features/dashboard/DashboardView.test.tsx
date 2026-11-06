import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { DashboardState, UsageDay, UsageOverview, UsageTotals } from "../../../../shared/api.ts";
import { DashboardView } from "../../../src/features/dashboard/DashboardView.tsx";
import { DEFAULT_LAYOUT, moveCard, setHidden, type DashboardLayout } from "../../../src/features/dashboard/layout.ts";
import { agentCounts } from "../../../src/lib/agents.ts";
import { listedThreads } from "../../../src/features/dashboard/sections.ts";
import type { ActivityState } from "../../../src/features/dashboard/useActivity.ts";
import type { LimitsState } from "../../../src/features/dashboard/useLimits.ts";
import { baseState, thread } from "../../fixtures.ts";

const NOW = new Date("2026-01-14T12:00:00.000Z");
const ask = { category: "approval" as const };
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
  days,
  thisWeek: totals(days.slice(7)),
  lastWeek: totals(days.slice(0, 7)),
  sessions: { thisWeek: 9, lastWeek: 6 },
  turnsPartial: false,
  cost: { status: "ok", detail: null, refreshing: false },
  readAt: "2026-01-14T11:59:00.000Z",
  ...over,
});
const state = (over: Partial<ActivityState> = {}): ActivityState => ({ usage: overview(), error: null, loading: false, refresh: () => {}, ...over });
const limitsState = (over: Partial<LimitsState> = {}): LimitsState => ({
  limits: { supported: true, providers: [], readAt: "2026-01-14T11:59:00.000Z" },
  error: null,
  loading: false,
  refresh: () => {},
  ...over,
});
const fresh = { since: "2026-01-01T00:00:00.000Z", seen: {} as Record<string, string> };
interface Options {
  limits?: LimitsState;
  threads?: ReturnType<typeof thread>[];
  layout?: DashboardLayout;
  editing?: boolean;
  seen?: typeof fresh;
  providers?: DashboardState["providers"];
}
const render = (activity: ActivityState, { limits = limitsState(), threads = [thread("a", { status: "running" })], layout = DEFAULT_LAYOUT, editing = false, seen = fresh, providers = [] }: Options = {}) =>
  renderToStaticMarkup(
    <DashboardView
      state={{ ...baseState(threads), providers }}
      limits={limits}
      activity={activity}
      visible={listedThreads(threads, ["t-routine"])}
      now={NOW}
      sessionIds={new Set()}
      running={agentCounts(threads).running}
      layout={layout}
      editing={editing}
      onLayout={() => {}}
      onOpen={() => {}}
      onSettle={async () => {}}
      seen={seen}
      seenReady
      onMarkRead={() => {}}
      automations={{ automations: [], hiddenThreadIds: ["t-routine"], setupThreadIds: [] }}
      automationsError={null}
      linearVersion={0}
    />,
  );
// One card, from its opening tag to its closing one.
const card = (out: string, head: "notifications-head" | "running-head" | "up-next-head") => {
  const start = out.lastIndexOf("<section", out.indexOf(`aria-labelledby="${head}"`));
  return out.slice(start, out.indexOf("</section>", start));
};

test("the Activity card is titled Activity and sits under Usage", () => {
  const out = render(state());
  assert.match(out, /<h2 id="dashboard-activity-head">Activity<\/h2>/);
  assert.match(out, /<h2 id="dashboard-usage-head">Usage<\/h2>/);
});

test("the three tiles cover the last 7 days, each with its change", () => {
  const out = render(state());
  // 63 turns this week against 49 the week before.
  assert.match(out, /Turns<\/span><span class="stat-value">63<span class="stat-delta">\+29 %/);
  const text = out.replace(/<[^>]+>/g, "");
  assert.match(text, /messages sent to agents · last 7 days/);
  assert.match(out, /Sessions<\/span><span class="stat-value">9<span class="stat-delta">\+50 %/);
  assert.match(text, /1 running · last 7 days/);
  assert.match(out, /Spend<span class="stat-more"> \(API equiv\.\)<\/span><\/span><span class="stat-value">\$[\d.]+<span class="stat-delta">/);
  assert.match(text, /last 7 days · all usage on this machine/);
  assert.doesNotMatch(out, /last 14 days ·/);
});

test("on a phone the tiles keep only the short label and caption", () => {
  const out = render(state());
  assert.match(out, /Spend<span class="stat-more">/);
  assert.match(out, /<span class="stat-more">messages sent to agents · <\/span>last 7 days/);
});

test("a partial turn count and unpriced models are said in the captions", () => {
  const out = render(state({ usage: overview({ turnsPartial: true, cost: { status: "partial", detail: null, refreshing: false } }) }));
  const text = out.replace(/<[^>]+>/g, "");
  assert.match(text, /last 7 days \(partial\)/);
  assert.match(text, /last 7 days · some models unpriced · all usage on this machine/);
});

test("unavailable cost shows a dash and T3's reason, and does not crash", () => {
  const out = render(state({ usage: overview({ cost: { status: "unavailable", detail: "This T3 Code version does not report usage.", refreshing: false } }) }));
  assert.match(out, /\(API equiv\.\)<\/span><\/span><span class="stat-value">—</);
  assert.match(out, /This T3 Code version does not report usage\./);
});

test("the chart has one labelled bar slot per day, today last, and a table for screen readers", () => {
  const out = render(state());
  assert.equal(out.match(/class="activity-hit"/g)?.length, 14);
  assert.match(out, /Jan 14: 9 turns, \$0\.50, 1\.2k tokens/);
  assert.match(out, />Today</);
  assert.match(out, /<table class="sr-only">/);
});

test("the default layout puts Usage, Activity, Running and Up next left and Notifications right", () => {
  const out = render(state());
  const right = out.indexOf('class="dashboard-col right pinned"');
  assert.ok(right > 0);
  assert.ok(out.indexOf('id="dashboard-usage-head"') < out.indexOf('id="dashboard-activity-head"'));
  assert.ok(out.indexOf('id="dashboard-activity-head"') < out.indexOf('id="running-head"'));
  assert.ok(out.indexOf('id="running-head"') < out.indexOf('id="up-next-head"'));
  assert.ok(out.indexOf('id="up-next-head"') < right);
  assert.ok(right < out.indexOf('id="notifications-head"'));
});

test("the right column is pinned only while it holds Notifications alone", () => {
  assert.doesNotMatch(render(state(), { layout: moveCard(DEFAULT_LAYOUT, "running", "right") }), /dashboard-col right pinned/);
});

test("a moved card follows the layout, and a hidden card is not drawn", () => {
  const moved = render(state(), { layout: moveCard(DEFAULT_LAYOUT, "running", "right", 0) });
  assert.ok(moved.indexOf('class="dashboard-col right"') < moved.indexOf('id="running-head"'));
  assert.ok(moved.indexOf('id="running-head"') < moved.indexOf('id="notifications-head"'));
  assert.doesNotMatch(render(state(), { layout: setHidden(DEFAULT_LAYOUT, "running", true) }), /running-head/);
});

test("each slot carries its place for the one-column layout", () => {
  const out = render(state());
  assert.match(out, /dashboard-slot notifications" style="--stack:1"/);
  assert.match(out, /dashboard-slot running" style="--stack:3"/);
});

test("before the first answer the Activity card shows a skeleton, with the thread cards already there", () => {
  const out = render(state({ usage: null }));
  assert.match(out, /class="skeleton"[^>]*aria-hidden/);
  assert.match(out, /aria-busy="true" aria-label="Loading activity"/);
  assert.match(out, /id="notifications-head"/);
  assert.doesNotMatch(out, /stat-value/);
});

test("a failed first read shows the error line instead of the skeleton", () => {
  const out = render(state({ usage: null, error: "Cannot reach the dashboard server." }));
  assert.match(out, /role="alert">Cannot reach/);
  assert.doesNotMatch(out, /Loading activity/);
});

test("a failed refresh keeps the last numbers and adds the error", () => {
  const out = render(state({ error: "Boom." }));
  assert.match(out, /stat-value">63/);
  assert.match(out, /Could not refresh activity\. Boom\./);
});

test("without edit mode there is no edit bar", () => {
  assert.doesNotMatch(render(state()), /card-edit-bar|inert/);
});

test("edit mode shows a bar with a drag handle and the move buttons on every card, and locks the card", () => {
  const out = render(state(), { editing: true });
  assert.equal(out.match(/class="card-edit-bar"/g)?.length, 5);
  assert.equal(out.match(/class="card-edit-bar" draggable="true"/g)?.length, 5);
  assert.match(out, /aria-label="Move Running to the right column"/);
  assert.match(out, /aria-label="Move Notifications to the left column"/);
  assert.match(out, /aria-label="Hide Up next"/);
  assert.equal(out.match(/class="dashboard-slot-body" inert=""/g)?.length, 5);
});

test("the first card of a column cannot move up and the last cannot move down", () => {
  const out = render(state(), { editing: true });
  assert.match(out, /<button disabled=""[^>]*aria-label="Move Usage up"/);
  assert.match(out, /<button disabled=""[^>]*aria-label="Move Up next down"/);
  assert.doesNotMatch(out, /<button disabled=""[^>]*aria-label="Move Running up"/);
});

test("edit mode lists hidden cards so they can be shown again", () => {
  const layout = setHidden(DEFAULT_LAYOUT, "running", true);
  const out = render(state(), { layout, editing: true });
  assert.match(out, /Hidden cards/);
  assert.match(out, /Show Running/);
  assert.doesNotMatch(render(state(), { layout }), /Hidden cards/);
});

test("an empty Dashboard says nothing needs you and that no agent runs", () => {
  const out = render(state(), { threads: [] });
  assert.match(card(out, "notifications-head"), /Nothing needs you/);
  assert.match(card(out, "running-head"), /No agent is running/);
});

test("notifications list what needs you first, then unread, with a count and Mark all read", () => {
  const out = card(
    render(state(), {
      threads: [
        thread("fin", { title: "Finished one", status: "completed", model: "model-x" }),
        thread("wait", { title: "Waiting one", status: "waiting", pending: ask }),
        thread("bad", { title: "Failed one", status: "failed", lastError: "Disk full" }),
      ],
    }),
    "notifications-head",
  );
  assert.match(out, /Notifications<\/h2><span class="count">3</);
  assert.ok(out.indexOf("notif-item needs") < out.indexOf("notif-item unread"));
  assert.ok(out.indexOf("Waiting one") < out.indexOf("Finished one"));
  assert.match(out, /Waiting for your approval/);
  assert.match(out, /Disk full/);
  assert.match(out, /aria-label="Mark all read"/);
  assert.match(out, /Project A · /);
  assert.doesNotMatch(out, /Nothing needs you/);
});

test("a read result stays in the list without a dot and greyed, under Nothing needs you", () => {
  const read = thread("fin", { title: "Finished one", status: "completed", lastActivityAt: "2026-01-14T10:00:00.000Z" });
  const out = card(render(state(), { threads: [read], seen: { ...fresh, seen: { fin: read.lastActivityAt } } }), "notifications-head");
  assert.match(out, /Nothing needs you/);
  assert.match(out, /notif-item read/);
  assert.doesNotMatch(out, /notif-dot/);
  assert.match(out, /<button disabled=""[^>]*aria-label="Mark all read"/);
});

test("read threads older than 3 days wait behind See all", () => {
  const old = thread("old", { title: "Old one", status: "completed", lastActivityAt: "2026-01-01T10:00:00.000Z" });
  const out = card(render(state(), { threads: [old], seen: { ...fresh, seen: { old: old.lastActivityAt } } }), "notifications-head");
  assert.doesNotMatch(out, /Old one/);
  assert.match(out, /See all \(1 more\)/);
});

test("an unread notification offers only Mark as read; Running rows have no button", () => {
  const out = render(state(), { threads: [thread("fin", { status: "completed" }), thread("run", { status: "running" })] });
  assert.match(card(out, "notifications-head"), /aria-label="Mark as read"/);
  assert.doesNotMatch(card(out, "notifications-head"), /aria-label="Settle"|aria-label="Open in Sessions"/);
  assert.doesNotMatch(card(out, "running-head"), /<button[^>]*aria-label|Open in T3 Code/);
  assert.match(card(out, "running-head"), /<button[^>]*class="run-row/);
});

test("the Running card lists working agents with a pulsing dot, model and project", () => {
  const providers = [{ instanceId: "provider-a", displayName: "Provider A", runtimeModes: [], models: [{ slug: "model-x", name: "Model X", effort: null, speed: null, favorite: null }] }];
  const out = card(render(state(), { threads: [thread("run", { title: "Running one", status: "running", model: "model-x" })], providers }), "running-head");
  assert.match(out, /class="pulse run-pulse"/);
  assert.match(out, /Running one/);
  assert.match(out, /Model X · Project A/);
  assert.match(out, /Running<\/h2><span class="count">1</);
});

test("routine threads stay out of every card", () => {
  assert.doesNotMatch(render(state(), { threads: [thread("t-routine", { title: "Routine run" })] }), /Routine run/);
});
