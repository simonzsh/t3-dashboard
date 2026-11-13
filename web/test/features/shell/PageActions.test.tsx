import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PageActions } from "../../../src/features/shell/PageActions.tsx";
import type { Tab } from "../../../src/lib/tabs.ts";

const noop = () => {};
const render = (tab: Tab, over: Partial<Parameters<typeof PageActions>[0]> = {}) =>
  renderToStaticMarkup(
    <PageActions tab={tab} compact={false} ready editingLayout={false} layoutIsDefault={false} layout="columns" onLayoutChange={noop} listHidden={false} onToggleList={noop} onAddProject={noop} onNewSession={noop} onNewAutomation={noop} newsCanRun newsRunning={false} onNewsRun={noop} onNewsSettings={noop} onSearch={noop} onSettings={noop} updateReady={false} onEditLayout={noop} onDoneLayout={noop} onResetLayout={noop} unread={0} notificationsOpen={false} onToggleNotifications={noop} {...over} />,
  );

test("Sessions shows the list toggle, then the layout toggle, then New Session", () => {
  const out = render("sessions");
  assert.ok(out.indexOf("Hide the list") >= 0 && out.indexOf("Hide the list") < out.indexOf("Switch to grid view"));
  assert.ok(out.indexOf("Switch to grid view") < out.indexOf("New Session"));
  assert.doesNotMatch(out, /Close all/);
});

test("a hidden list offers Show the list", () => {
  const out = render("sessions", { listHidden: true });
  assert.match(out, /aria-label="Show the list"/);
  assert.doesNotMatch(out, /Hide the list/);
});

test("on a phone Sessions shows New Session, then Search, and no list button", () => {
  const out = render("sessions", { compact: true });
  assert.ok(out.indexOf('aria-label="New Session"') < out.indexOf('aria-label="Search"'));
  assert.doesNotMatch(out, /Hide the list|Show the list/);
});

test("Sessions shows the layout toggle, then New Session with its icon and key", () => {
  const out = render("sessions");
  assert.match(out, /class="btn md primary"[^>]*><svg[^>]*>.*<\/svg> New Session<kbd/);
  assert.ok(out.indexOf('aria-label="Switch to grid view"') < out.indexOf("New Session"));
  assert.doesNotMatch(out, /New Automation|Edit layout/);
});

test("one layout button names the view it switches to", () => {
  const columns = render("sessions", { layout: "columns" });
  assert.match(columns, /aria-label="Switch to grid view"/);
  assert.doesNotMatch(columns, /Switch to column view/);
  assert.equal(columns.match(/layout-toggle/g)?.length, 1);
  assert.match(render("sessions", { layout: "grid" }), /aria-label="Switch to column view"/);
});

test("the layout toggle is hidden when it is off, and on other pages", () => {
  assert.doesNotMatch(render("sessions", { compact: true }), /Switch to (grid|column) view/);
  assert.match(render("sessions", { compact: true }), /New Session/);
  for (const tab of ["home", "automations"] as const) assert.doesNotMatch(render(tab), /Switch to (grid|column) view/);
});

test("Automations shows New Automation only", () => {
  const out = render("automations");
  assert.match(out, /New Automation/);
  // The wide button carries the same icon as the phone one, before its label.
  assert.match(out, /<svg[^>]*>.*<\/svg> New Automation/);
  assert.doesNotMatch(out, /New Session|Edit layout/);
});

test("Dashboard shows the bell, then Edit layout", () => {
  const out = render("home");
  assert.ok(out.indexOf('aria-label="Notifications"') >= 0 && out.indexOf('aria-label="Notifications"') < out.indexOf("Edit layout"));
  assert.doesNotMatch(out, /New Session|New Automation/);
});

test("the bell is pressed while the panel is open, and its tooltip names the next action", () => {
  const open = render("home", { notificationsOpen: true });
  assert.match(open, /aria-pressed="true"/);
  assert.match(open, /data-tooltip="Hide notifications"/);
  const closed = render("home");
  assert.match(closed, /aria-pressed="false"/);
  assert.match(closed, /data-tooltip="Show notifications"/);
});

test("the bell badge shows the unread count, 9+ above nine, and nothing at zero", () => {
  const some = render("home", { unread: 3 });
  assert.match(some, /aria-label="Notifications, 3 unread"/);
  assert.match(some, /class="count-badge"[^>]*>3</);
  const many = render("home", { unread: 12 });
  assert.match(many, /aria-label="Notifications, 12 unread"/);
  assert.match(many, />9\+</);
  assert.doesNotMatch(render("home"), /count-badge/);
});

test("the bell shows only on Dashboard and not in edit mode", () => {
  assert.doesNotMatch(render("home", { editingLayout: true }), /Notifications/);
  for (const tab of ["sessions", "automations"] as const) assert.doesNotMatch(render(tab), /Notifications/);
});

test("in edit mode Dashboard shows Reset, then the primary Done", () => {
  const out = render("home", { editingLayout: true });
  assert.ok(out.indexOf(">Reset<") < out.indexOf(">Done<"));
  assert.match(out, /class="btn md primary"[^>]*>Done/);
  assert.doesNotMatch(out, /Edit layout/);
});

test("Reset is disabled while the layout is the default", () => {
  assert.match(render("home", { editingLayout: true, layoutIsDefault: true }), /<button[^>]*disabled=""[^>]*>Reset/);
});

test("on a phone the page action is an icon button, with the search button", () => {
  assert.match(render("sessions", { compact: true }), /aria-label="Search"/);
  assert.match(render("sessions", { compact: true }), /aria-label="New Session"/);
  assert.match(render("automations", { compact: true }), /aria-label="New Automation"/);
});

test("without the dashboard state Sessions and Automations show no create button", () => {
  assert.equal(render("sessions", { ready: false }), "");
  assert.equal(render("automations", { ready: false }), "");
});

test("on a phone Dashboard has the bell, Edit layout as an icon, then Reset and Done while editing", () => {
  const out = render("home", { compact: true });
  assert.ok(out.indexOf('aria-label="Notifications"') < out.indexOf('aria-label="Edit layout"'));
  assert.match(out, /aria-label="Edit layout"/);
  assert.match(out, /aria-label="Search"/);
  const editing = render("home", { compact: true, editingLayout: true });
  assert.match(editing, /aria-label="Reset"/);
  assert.match(editing, /aria-label="Done"/);
});

test("on a phone every page header ends with Search and Settings", () => {
  for (const tab of ["home", "sessions", "automations", "news"] as const) {
    const out = render(tab, { compact: true });
    assert.ok(out.indexOf('aria-label="Search"') < out.indexOf('aria-label="Settings"'), tab);
  }
  assert.doesNotMatch(render("home"), /aria-label="Settings"/);
});

test("on a phone the Settings button shows a dot when an update is ready", () => {
  const out = renderToStaticMarkup(
    <PageActions tab="sessions" compact ready editingLayout={false} layoutIsDefault={false} layout="columns" onLayoutChange={noop} listHidden={false} onToggleList={noop} onAddProject={noop} onNewSession={noop} onNewAutomation={noop} newsCanRun newsRunning={false} onNewsRun={noop} onNewsSettings={noop} onSearch={noop} onSettings={noop} updateReady onEditLayout={noop} onDoneLayout={noop} onResetLayout={noop} unread={0} notificationsOpen={false} onToggleNotifications={noop} />,
  );
  assert.match(out, /class="[^"]*has-update[^"]*"[^>]*aria-label="Settings, an update is ready"|aria-label="Settings, an update is ready"[^>]*class="[^"]*has-update/);
});

test("News shows News settings, then the primary Run now", () => {
  const out = render("news");
  assert.ok(out.indexOf("News settings") < out.indexOf("Run now"));
  // News settings is an icon on every screen: a label only in its tooltip.
  assert.match(out, /aria-label="News settings" data-tooltip="News settings"/);
  assert.doesNotMatch(out, />News settings</);
  assert.match(out, /class="btn md primary"[^>]*><svg[^>]*>.*<\/svg> Run now/);
  assert.doesNotMatch(out, /New Session|New Automation|Edit layout/);
});

test("Run now is disabled without a saved task and while a run starts", () => {
  assert.match(render("news", { newsCanRun: false }), /<button[^>]*disabled=""[^>]*>.*Run now/);
  assert.match(render("news", { newsRunning: true }), /<button[^>]*disabled=""[^>]*>.*Run now/);
  assert.doesNotMatch(render("news"), /disabled=""/);
});

test("on a phone News has icon buttons, and nothing before the state exists", () => {
  const out = render("news", { compact: true });
  assert.match(out, /aria-label="News settings"/);
  assert.match(out, /aria-label="Run now"/);
  assert.equal(render("news", { ready: false }), "");
});

test("News has no list toggle: its list always shows", () => {
  assert.doesNotMatch(render("news"), /the list"/);
});

test("News settings shows the preferences sliders, not the pencil or the app gear", () => {
  const out = render("news");
  const button = out.slice(out.indexOf('aria-label="News settings"'), out.indexOf("</button>", out.indexOf('aria-label="News settings"')));
  assert.match(button, /M21 4h-7/);
  assert.doesNotMatch(button, /M12 20h9/);
  // Ghost like the list toggle beside it: no background.
  assert.match(out, /class="icon-button md ghost"[^>]*aria-label="News settings"|aria-label="News settings"[^>]*class="icon-button md ghost"/);
});


test("Sessions places the icon-only Add project before New Session", () => {
  for (const compact of [false, true]) {
    const html = render("sessions", { compact });
    assert.ok(html.indexOf('aria-label="Add project"') >= 0);
    assert.ok(html.indexOf('aria-label="Add project"') < html.indexOf('New Session'));
    assert.doesNotMatch(html, />Add project</);
  }
});
