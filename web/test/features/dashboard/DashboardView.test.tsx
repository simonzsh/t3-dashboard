import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ActivityPeriod, DashboardState, LimitsOverview, ServerStats, UsageDay, UsageOverview, UsageTotals } from "../../../../shared/api.ts";
import { DashboardView } from "../../../src/features/dashboard/DashboardView.tsx";
import { DEFAULT_LAYOUT, setHidden, shiftCard, type DashboardLayout } from "../../../src/features/dashboard/layout.ts";
import { AutomationThreadsContext } from "../../../src/lib/automationThreads.tsx";
import type { ReadState } from "../../../src/features/dashboard/pollRead.ts";
import type { ActivityState } from "../../../src/features/dashboard/useActivity.ts";
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
  period: 7,
  days,
  current: totals(days.slice(7)),
  previous: totals(days.slice(0, 7)),
  sessions: { current: 9, previous: 6 },
  turnsPartial: false,
  cost: { status: "ok", detail: null, refreshing: false },
  readAt: "2026-01-14T11:59:00.000Z",
  ...over,
});
const state = (over: Partial<ActivityState> = {}): ActivityState => ({ value: overview(), error: null, loading: false, refresh: () => {}, period: 7, setPeriod: () => {}, ...over });
// An overview of `period`: twice as many days, ending 2026-01-14.
const overviewOf = (period: ActivityPeriod): UsageOverview => {
  const list = Array.from({ length: 2 * period }, (_, i): UsageDay => ({ ...days[0]!, day: new Date(Date.UTC(2026, 0, 14 - (2 * period - 1 - i))).toISOString().slice(0, 10), turns: 1 }));
  return overview({ period, days: list, current: totals(list.slice(period)), previous: totals(list.slice(0, period)) });
};
const limitsState = (over: Partial<ReadState<LimitsOverview>> = {}): ReadState<LimitsOverview> => ({
  value: { supported: true, providers: [], readAt: "2026-01-14T11:59:00.000Z" },
  error: null,
  loading: false,
  refresh: () => {},
  ...over,
});
const serverState = (over: Partial<ReadState<ServerStats>> = {}): ReadState<ServerStats> => ({
  value: { host: "devbox", os: "Linux", uptimeSeconds: 3600, cpu: { usedPercent: 10, cores: 4 }, memory: { usedBytes: 1, totalBytes: 4, usedPercent: 25 }, disk: null, readAt: "2026-01-14T11:59:00.000Z" },
  error: null,
  loading: false,
  refresh: () => {},
  ...over,
});
const fresh = { since: "2026-01-01T00:00:00.000Z", seen: {} as Record<string, string> };
interface Options {
  limits?: ReadState<LimitsOverview>;
  threads?: ReturnType<typeof thread>[];
  layout?: DashboardLayout;
  editing?: boolean;
  panelOpen?: boolean;
  sheet?: boolean;
  seen?: typeof fresh;
  providers?: DashboardState["providers"];
  automationIds?: string[];
}
const render = (activity: ActivityState, { limits = limitsState(), threads = [thread("a", { status: "running" })], layout = DEFAULT_LAYOUT, editing = false, panelOpen = true, sheet = false, seen = fresh, providers = [], automationIds = [] }: Options = {}) =>
  renderToStaticMarkup(
    <AutomationThreadsContext.Provider value={new Set(automationIds)}>
    <DashboardView
      state={{ ...baseState(threads), providers }}
      limits={limits}
      server={serverState()}
      activity={activity}
      now={NOW}
      sessionIds={new Set()}
      layout={layout}
      editing={editing}
      panelOpen={panelOpen}
      sheet={sheet}
      onCloseSheet={() => {}}
      onLayout={() => {}}
      onOpen={() => {}}
      onSettle={async () => {}}
      seen={seen}
      seenReady
      onMarkRead={() => {}}
      linearVersion={0}
    />
    </AutomationThreadsContext.Provider>,
  );
// One card, from its opening tag to its closing one.
const card = (out: string, head: "notifications-head" | "running-head") => {
  const start = out.lastIndexOf("<section", out.indexOf(`aria-labelledby="${head}"`));
  return out.slice(start, out.indexOf("</section>", start));
};

test("the Activity card is titled Activity and sits under Usage", () => {
  const out = render(state());
  assert.match(out, /<h2 id="dashboard-activity-head">Activity<\/h2>/);
  assert.match(out, /<h2 id="dashboard-usage-head">Usage<\/h2>/);
});

test("the card says once that it covers the last 7 days, and each tile shows its change", () => {
  const out = render(state());
  // 63 turns this week against 49 the week before.
  assert.match(out, /Turns<\/span><span class="stat-value">63<span class="stat-delta">\+29 %/);
  const text = out.replace(/<[^>]+>/g, "");
  assert.match(out, /<button[^>]*aria-label="Activity period"[^>]*><span class="dropdown-value">last 7 days<\/span>/);
  assert.equal(text.match(/last 7 days/g)?.length, 1);
  assert.match(text, /messages sent to agents/);
  assert.match(out, /Sessions<\/span><span class="stat-value">9<span class="stat-delta">\+50 %/);
  assert.match(text, /conversations with at least one turn/);
  assert.match(out, /Spend<span class="stat-more"> \(API equiv\.\)<\/span><\/span><span class="stat-value">\$[\d.]+<span class="stat-delta[^"]*">/);
  assert.match(text, /all usage on this machine/);
  assert.doesNotMatch(out, /last 14 days ·/);
});

test("a drop shows in red, a rise in green and no change in gray", () => {
  const down = render(state({ value: overview({ current: { ...overview().current, turns: 30 }, previous: { ...overview().previous, turns: 60 } }) }));
  assert.match(down, /<span class="stat-delta down">−50 %/);
  const flat = render(state({ value: overview({ current: { ...overview().current, turns: 60 }, previous: { ...overview().previous, turns: 60 } }) }));
  assert.match(flat, /<span class="stat-delta flat">0 %/);
});

test("a partial turn count and unpriced models are said in the captions", () => {
  const out = render(state({ value: overview({ turnsPartial: true, cost: { status: "partial", detail: null, refreshing: false } }) }));
  const text = out.replace(/<[^>]+>/g, "");
  assert.match(text, /messages sent to agents \(partial\)/);
  assert.match(text, /some models unpriced · all usage on this machine/);
});

test("unavailable cost shows a dash and T3's reason, and does not crash", () => {
  const out = render(state({ value: overview({ cost: { status: "unavailable", detail: "This T3 Code version does not report usage.", refreshing: false } }) }));
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

test("each period has its own heading, number of bars and menu label", () => {
  for (const [period, title, count, label] of [[30, "Last 30 days", 30, "last 30 days"], [90, "Last 13 weeks", 13, "last 90 days"]] as const) {
    const out = render(state({ value: overviewOf(period), period }));
    assert.equal(out.match(/class="activity-hit"/g)?.length, count);
    assert.match(out, new RegExp(`<h2>${title}</h2>`));
    assert.match(out, new RegExp(`aria-label="Activity period"[^>]*><span class="dropdown-value">${label}</span>`));
  }
  assert.match(render(state({ value: overviewOf(90), period: 90 })), /Jan 8 – Jan 14/);
});

test("numbers of another period never show under the new label", () => {
  const out = render(state({ value: overview(), period: 30 }));
  assert.match(out, /aria-label="Loading activity"/);
  assert.doesNotMatch(out, /class="activity-hit"/);
  assert.match(out, /last 30 days/);
});

test("the default layout draws Activity full width, then two columns of half cards", () => {
  const out = render(state());
  const head = (id: string) => out.indexOf(`id="${id}"`);
  const band = out.indexOf('class="dashboard-band"');
  assert.ok(band > head("dashboard-activity-head"));
  assert.equal(out.match(/class="dashboard-band"/g)?.length, 1);
  const left = out.indexOf('class="dashboard-col left"');
  const right = out.indexOf('class="dashboard-col right"');
  assert.ok(band < left && left < head("dashboard-usage-head") && head("dashboard-usage-head") && head("dashboard-usage-head") < right);
  assert.ok(right < head("running-head") && head("running-head") < head("dashboard-server-head") && head("dashboard-server-head"));
});

test("an open panel sits beside the cards and holds Notifications", () => {
  const out = render(state());
  assert.match(out, /<div class="dashboard with-panel">/);
  const aside = out.indexOf('<aside data-dash-item="notifications" class="dashboard-panel" aria-label="Notifications">');
  assert.ok(aside > out.indexOf('id="dashboard-server-head"'));
  assert.ok(aside < out.indexOf('id="notifications-head"'));
  assert.equal(out.match(/id="notifications-head"/g)?.length, 1);
});

test("a closed panel is not drawn and the cards stay", () => {
  const out = render(state(), { panelOpen: false });
  assert.match(out, /<div class="dashboard">/);
  assert.doesNotMatch(out, /dashboard-panel|notifications-head/);
  assert.match(out, /id="running-head"/);
});

test("edit mode hides the panel even when it is open, and Notifications has no edit bar", () => {
  const out = render(state(), { editing: true });
  assert.doesNotMatch(out, /dashboard-panel|notifications-head|with-panel|Move Notifications/);
});

test("a moved card follows the layout, and a hidden card is not drawn", () => {
  const moved = render(state(), { layout: shiftCard(DEFAULT_LAYOUT, "running", -1) });
  assert.ok(moved.indexOf('id="running-head"') < moved.indexOf('id="dashboard-activity-head"'));
  assert.doesNotMatch(render(state(), { layout: setHidden(DEFAULT_LAYOUT, "running", true) }), /running-head/);
});

test("before the first answer the Activity card shows a skeleton, with the thread cards already there", () => {
  const out = render(state({ value: null }));
  assert.match(out, /class="skeleton"[^>]*aria-hidden/);
  assert.match(out, /aria-busy="true" aria-label="Loading activity"/);
  assert.match(out, /id="notifications-head"/);
  assert.doesNotMatch(out, />Turns</);
});

test("a failed first read shows the error line instead of the skeleton", () => {
  const out = render(state({ value: null, error: "Cannot reach the dashboard server." }));
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
  assert.equal(out.match(/class="card-edit-bar"/g)?.length, 4);
  assert.equal(out.match(/class="card-edit-bar" draggable="true"/g)?.length, 4);
  assert.match(out, /aria-label="Make Activity half width"/);
  assert.match(out, /aria-label="Make Usage full width"/);
  assert.match(out, /aria-label="Hide Server"/);
  assert.equal(out.match(/class="dashboard-slot-body" inert=""/g)?.length, 4);
});

test("a card that cannot move up or down has that button disabled", () => {
  const out = render(state(), { editing: true });
  for (const label of ["Move Activity up", "Move Server down", "Move Usage down"]) assert.match(out, new RegExp(`<button disabled=""[^>]*aria-label="${label}"`));
  for (const label of ["Move Usage up", "Move Running down", "Move Server up", "Move Activity down"]) assert.doesNotMatch(out, new RegExp(`<button disabled=""[^>]*aria-label="${label}"`));
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
  assert.match(out, /project-tag-text">Project A</);
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
  assert.match(out, /notif-age.*project-tag-text">Project A<.*provider-icon/);
  assert.match(out, /Running<\/h2><span class="count">1</);
});

test("the Running card says it is live, with a dot", () => {
  const out = card(render(state()), "running-head");
  assert.match(out, /<span class="card-live"><span class="live-dot" aria-hidden="true"><\/span>Live<\/span>/);
  assert.match(card(render(state(), { threads: [] }), "running-head"), /Live/);
});

test("an automation run is listed like any session, with the automation icon", () => {
  const run = thread("t-routine", { title: "Routine run", status: "running" });
  const done = thread("t-done", { title: "Finished run", status: "completed", lastActivityAt: "2026-01-14T11:00:00.000Z" });
  const out = render(state(), { threads: [run, done], automationIds: ["t-routine", "t-done"] });
  assert.match(card(out, "running-head"), /Routine run.*auto-mark/);
  assert.match(card(out, "notifications-head"), /Finished run.*auto-mark/);
});

test("in sheet mode the panel is a dialog sheet with a backdrop, and it takes no room", () => {
  const out = render(state(), { sheet: true });
  assert.match(out, /<div class="ui-sheet-backdrop open" aria-hidden="true">/);
  assert.match(out, /<aside tabindex="-1" class="ui-sheet narrow open" role="dialog" aria-modal="true" aria-label="Notifications">/);
  assert.doesNotMatch(out, /with-panel|data-dash-item="notifications"/);
  assert.equal(out.match(/id="notifications-head"/g)?.length, 1);
});

test("a closed sheet stays mounted for its slide-out, but inert", () => {
  const out = render(state(), { sheet: true, panelOpen: false });
  assert.match(out, /<aside tabindex="-1" class="ui-sheet narrow" role="dialog"[^>]* inert=""/);
  assert.doesNotMatch(out, /ui-sheet-backdrop open|ui-sheet narrow open/);
});

test("edit mode removes the sheet and its backdrop", () => {
  assert.doesNotMatch(render(state(), { sheet: true, editing: true }), /dashboard-panel|ui-sheet|notifications-head/);
});

test("the wide panel is a plain aside: no dialog role, no close button, nothing inert", () => {
  const out = render(state());
  assert.doesNotMatch(out, /role="dialog"|aria-modal|Close notifications/);
  assert.doesNotMatch(out, /class="dashboard-main" inert/);
});

test("the Server card sits in its slot, and its stats show", () => {
  const out = render(state());
  assert.match(out, /class="dashboard-slot server"/);
  assert.match(out, /devbox · Linux · up 1 h/);
});

test("while the board is unknown the Linear card has no slot, in normal and edit mode", () => {
  for (const editing of [false, true]) {
    const out = render(state(), { editing });
    assert.doesNotMatch(out, /linear-head|dashboard-slot linear|Move Linear|Hide Linear/, `editing: ${editing}`);
    for (const head of ["dashboard-activity-head", "dashboard-usage-head", "running-head", "dashboard-server-head"]) assert.match(out, new RegExp(`id="${head}"`));
  }
});

test("a Linear card hidden in the layout can be shown again from edit mode", () => {
  const layout = setHidden(DEFAULT_LAYOUT, "linear", true);
  const out = render(state(), { layout, editing: true });
  assert.match(out, /Hidden cards/);
  assert.match(out, /Show Linear/);
  assert.doesNotMatch(render(state(), { layout }), /Hidden cards|linear-head/);
});
