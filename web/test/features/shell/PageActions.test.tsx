import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PageActions } from "../../../src/features/shell/PageActions.tsx";
import type { Tab } from "../../../src/lib/tabs.ts";

const noop = () => {};
const render = (tab: Tab, over: Partial<Parameters<typeof PageActions>[0]> = {}) =>
  renderToStaticMarkup(
    <PageActions tab={tab} compact={false} ready editingLayout={false} layoutIsDefault={false} layout="columns" onLayoutChange={noop} showLayoutToggle onNewSession={noop} onNewAutomation={noop} onSearch={noop} onEditLayout={noop} onDoneLayout={noop} onResetLayout={noop} {...over} />,
  );

test("Sessions shows the layout toggle, then New Session with its icon and key", () => {
  const out = render("desk");
  assert.match(out, /class="btn md primary"[^>]*><svg[^>]*>.*<\/svg> New Session<kbd/);
  assert.ok(out.indexOf('aria-label="Layout"') < out.indexOf("New Session"));
  assert.doesNotMatch(out, /New Automation|Edit layout/);
});

test("the layout toggle marks the active view", () => {
  const columns = render("desk", { layout: "columns" });
  assert.match(columns, /aria-pressed="true"[^>]*aria-label="Column view"/);
  assert.match(columns, /aria-pressed="false"[^>]*aria-label="Grid view"/);
  const grid = render("desk", { layout: "grid" });
  assert.match(grid, /aria-pressed="false"[^>]*aria-label="Column view"/);
  assert.match(grid, /aria-pressed="true"[^>]*aria-label="Grid view"/);
});

test("the layout toggle is hidden when it is off, and on other pages", () => {
  assert.doesNotMatch(render("desk", { showLayoutToggle: false }), /Layout|Column view/);
  assert.match(render("desk", { showLayoutToggle: false }), /New Session/);
  for (const tab of ["home", "automations"] as const) assert.doesNotMatch(render(tab), /Column view|Grid view/);
});

test("Automations shows New Automation only", () => {
  const out = render("automations");
  assert.match(out, /New Automation/);
  assert.doesNotMatch(out, /New Session|Edit layout/);
});

test("Home shows Edit layout only", () => {
  const out = render("home");
  assert.match(out, /Edit layout/);
  assert.doesNotMatch(out, /New Session|New Automation/);
});

test("in edit mode Home shows Reset, then the primary Done", () => {
  const out = render("home", { editingLayout: true });
  assert.ok(out.indexOf(">Reset<") < out.indexOf(">Done<"));
  assert.match(out, /class="btn md primary"[^>]*>Done/);
  assert.doesNotMatch(out, /Edit layout/);
});

test("Reset is disabled while the layout is the default", () => {
  assert.match(render("home", { editingLayout: true, layoutIsDefault: true }), /<button[^>]*disabled=""[^>]*>Reset/);
});

test("on a phone the page action is an icon button, with the search button", () => {
  const home = render("home", { compact: true });
  assert.match(home, /aria-label="Edit layout"/);
  assert.match(home, /aria-label="Search"/);
  assert.doesNotMatch(home, />Edit layout</);
  assert.match(render("desk", { compact: true }), /aria-label="New Session"/);
  assert.match(render("automations", { compact: true }), /aria-label="New Automation"/);
});

test("without the dashboard state Sessions and Automations show no create button", () => {
  assert.equal(render("desk", { ready: false }), "");
  assert.equal(render("automations", { ready: false }), "");
});
