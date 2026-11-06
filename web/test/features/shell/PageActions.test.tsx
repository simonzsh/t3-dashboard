import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { PageActions } from "../../../src/features/shell/PageActions.tsx";
import type { Tab } from "../../../src/lib/tabs.ts";

const noop = () => {};
const render = (tab: Tab, over: Partial<Parameters<typeof PageActions>[0]> = {}) =>
  renderToStaticMarkup(
    <PageActions tab={tab} compact={false} ready editingLayout={false} layoutIsDefault={false} onNewAgent={noop} onNewAutomation={noop} onSearch={noop} onEditLayout={noop} onDoneLayout={noop} onResetLayout={noop} {...over} />,
  );

test("Desk shows New Agent only", () => {
  const out = render("desk");
  assert.match(out, /New Agent/);
  assert.doesNotMatch(out, /New Automation|Edit layout/);
});

test("Automations shows New Automation only", () => {
  const out = render("automations");
  assert.match(out, /New Automation/);
  assert.doesNotMatch(out, /New Agent|Edit layout/);
});

test("Home shows Edit layout only", () => {
  const out = render("home");
  assert.match(out, /Edit layout/);
  assert.doesNotMatch(out, /New Agent|New Automation/);
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
  assert.match(render("desk", { compact: true }), /aria-label="New Agent"/);
  assert.match(render("automations", { compact: true }), /aria-label="New Automation"/);
});

test("without the dashboard state Desk and Automations show no create button", () => {
  assert.equal(render("desk", { ready: false }), "");
  assert.equal(render("automations", { ready: false }), "");
});
