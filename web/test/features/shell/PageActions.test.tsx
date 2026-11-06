import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PageActions } from "../../../src/features/shell/PageActions.tsx";
import type { Tab } from "../../../src/lib/tabs.ts";

const noop = () => {};
const render = (tab: Tab, over: Partial<Parameters<typeof PageActions>[0]> = {}) =>
  renderToStaticMarkup(
    <PageActions tab={tab} compact={false} ready editingLayout={false} layoutIsDefault={false} layout="columns" onLayoutChange={noop} showLayoutToggle listHidden={false} onToggleList={noop} onNewSession={noop} onNewAutomation={noop} onSearch={noop} onEditLayout={noop} onDoneLayout={noop} onResetLayout={noop} {...over} />,
  );

test("Sessions shows the list toggle, then the layout toggle, then New Session", () => {
  const out = render("sessions");
  assert.ok(out.indexOf("Hide the list") >= 0 && out.indexOf("Hide the list") < out.indexOf("Switch to grid view"));
  assert.ok(out.indexOf("Switch to grid view") < out.indexOf("New Session"));
  assert.doesNotMatch(out, /recent activity|Group by project|all projects|Close all/);
});

test("a hidden list offers Show the list", () => {
  const out = render("sessions", { listHidden: true });
  assert.match(out, /aria-label="Show the list"/);
  assert.doesNotMatch(out, /Hide the list/);
});

test("on a phone Sessions shows New Session, then Search, and no list button", () => {
  const out = render("sessions", { compact: true, showLayoutToggle: false });
  assert.ok(out.indexOf('aria-label="New Session"') < out.indexOf('aria-label="Search"'));
  assert.doesNotMatch(out, /Hide the list|Show the list|recent activity|Group by project|Close all/);
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
  assert.doesNotMatch(render("sessions", { showLayoutToggle: false }), /Switch to (grid|column) view/);
  assert.match(render("sessions", { showLayoutToggle: false }), /New Session/);
  for (const tab of ["dashboard", "automations"] as const) assert.doesNotMatch(render(tab), /Switch to (grid|column) view/);
});

test("Automations shows New Automation only", () => {
  const out = render("automations");
  assert.match(out, /New Automation/);
  assert.doesNotMatch(out, /New Session|Edit layout/);
});

test("Dashboard shows Edit layout only", () => {
  const out = render("dashboard");
  assert.match(out, /Edit layout/);
  assert.doesNotMatch(out, /New Session|New Automation/);
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

test("on a phone Dashboard has no Edit layout, only the search button", () => {
  const out = render("dashboard", { compact: true });
  assert.doesNotMatch(out, /Edit layout|Done|Reset/);
  assert.match(out, /aria-label="Search"/);
  assert.doesNotMatch(render("dashboard", { compact: true, editingLayout: true }), /Done|Reset/);
});
