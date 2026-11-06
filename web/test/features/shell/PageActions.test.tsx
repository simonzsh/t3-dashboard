import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PageActions } from "../../../src/features/shell/PageActions.tsx";
import type { Tab } from "../../../src/lib/tabs.ts";

const noop = () => {};
const render = (tab: Tab, over: Partial<Parameters<typeof PageActions>[0]> = {}) =>
  renderToStaticMarkup(
    <PageActions tab={tab} compact={false} ready editingLayout={false} layoutIsDefault={false} layout="columns" onLayoutChange={noop} listHidden={false} onToggleList={noop} onNewSession={noop} onNewAutomation={noop} onSearch={noop} onSettings={noop} updateReady={false} onEditLayout={noop} onDoneLayout={noop} onResetLayout={noop} unread={0} notificationsOpen={false} onToggleNotifications={noop} {...over} />,
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
  for (const tab of ["dashboard", "automations"] as const) assert.doesNotMatch(render(tab), /Switch to (grid|column) view/);
});

test("Automations shows New Automation only", () => {
  const out = render("automations");
  assert.match(out, /New Automation/);
  assert.doesNotMatch(out, /New Session|Edit layout/);
});

test("Dashboard shows the bell, then Edit layout", () => {
  const out = render("dashboard");
  assert.ok(out.indexOf('aria-label="Notifications"') >= 0 && out.indexOf('aria-label="Notifications"') < out.indexOf("Edit layout"));
  assert.doesNotMatch(out, /New Session|New Automation/);
});

test("the bell is pressed while the panel is open, and its tooltip names the next action", () => {
  const open = render("dashboard", { notificationsOpen: true });
  assert.match(open, /aria-pressed="true"/);
  assert.match(open, /data-tooltip="Hide notifications"/);
  const closed = render("dashboard");
  assert.match(closed, /aria-pressed="false"/);
  assert.match(closed, /data-tooltip="Show notifications"/);
});

test("the bell badge shows the unread count, 9+ above nine, and nothing at zero", () => {
  const some = render("dashboard", { unread: 3 });
  assert.match(some, /aria-label="Notifications, 3 unread"/);
  assert.match(some, /class="nav-badge"[^>]*>3</);
  const many = render("dashboard", { unread: 12 });
  assert.match(many, /aria-label="Notifications, 12 unread"/);
  assert.match(many, />9\+</);
  assert.doesNotMatch(render("dashboard"), /nav-badge/);
});

test("the bell shows only on Dashboard and not in edit mode", () => {
  assert.doesNotMatch(render("dashboard", { editingLayout: true }), /Notifications/);
  for (const tab of ["sessions", "automations"] as const) assert.doesNotMatch(render(tab), /Notifications/);
});

test("in edit mode Dashboard shows Reset, then the primary Done", () => {
  const out = render("dashboard", { editingLayout: true });
  assert.ok(out.indexOf(">Reset<") < out.indexOf(">Done<"));
  assert.match(out, /class="btn md primary"[^>]*>Done/);
  assert.doesNotMatch(out, /Edit layout/);
});

test("Reset is disabled while the layout is the default", () => {
  assert.match(render("dashboard", { editingLayout: true, layoutIsDefault: true }), /<button[^>]*disabled=""[^>]*>Reset/);
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
  const out = render("dashboard", { compact: true });
  assert.ok(out.indexOf('aria-label="Notifications"') < out.indexOf('aria-label="Edit layout"'));
  assert.match(out, /aria-label="Edit layout"/);
  assert.match(out, /aria-label="Search"/);
  const editing = render("dashboard", { compact: true, editingLayout: true });
  assert.match(editing, /aria-label="Reset"/);
  assert.match(editing, /aria-label="Done"/);
});

test("on a phone every page header ends with Search and Settings", () => {
  for (const tab of ["dashboard", "sessions", "automations"] as const) {
    const out = render(tab, { compact: true });
    assert.ok(out.indexOf('aria-label="Search"') < out.indexOf('aria-label="Settings"'), tab);
  }
  assert.doesNotMatch(render("dashboard"), /aria-label="Settings"/);
});

test("on a phone the Settings button shows a dot when an update is ready", () => {
  const out = renderToStaticMarkup(
    <PageActions tab="sessions" compact ready editingLayout={false} layoutIsDefault={false} layout="columns" onLayoutChange={noop} listHidden={false} onToggleList={noop} onNewSession={noop} onNewAutomation={noop} onSearch={noop} onSettings={noop} updateReady onEditLayout={noop} onDoneLayout={noop} onResetLayout={noop} unread={0} notificationsOpen={false} onToggleNotifications={noop} />,
  );
  assert.match(out, /class="[^"]*has-update[^"]*"[^>]*aria-label="Settings, an update is ready"|aria-label="Settings, an update is ready"[^>]*class="[^"]*has-update/);
});
