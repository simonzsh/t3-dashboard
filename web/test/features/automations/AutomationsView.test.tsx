import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Automation, AutomationsResult } from "../../../../shared/api.ts";
import { ApiProvider } from "../../../src/api/ApiContext.tsx";
import { AutomationsView } from "../../../src/features/automations/AutomationsView.tsx";
import { baseState } from "../../fixtures.ts";

const auto = (id: string): Automation => ({
  id, kind: "routine", title: `Job ${id}`, projectId: "project-a", project: "Project A", scheduleLabel: "daily 9:00", enabled: true, nextRunAt: null, lastRunAt: null, lastRunStatus: null, lastRunError: null,
  threadId: null, modelSelection: null, prompt: "Do it", schedule: null, runtimeMode: null, bound: false, webhook: null, runs: [],
});

function view(list: Automation[]) {
  const automations: AutomationsResult = { automations: list, automationThreadIds: [], setupThreadIds: [] };
  return renderToStaticMarkup(
    <ApiProvider value={{} as never}>
      <AutomationsView state={baseState()} now={new Date()} seen={{ since: "2026-01-01T00:00:00.000Z", seen: {} }} onOpen={() => {}} automations={automations} automationsError={null} onAutomationsStale={async () => {}} onNewAutomation={() => {}} setup={[]} />
    </ApiProvider>,
  );
}

test("the list has a toolbar with search, the five filters and a sort, even with one automation", () => {
  const out = view([auto("a")]);
  assert.match(out, /aria-label="Search automations"/);
  for (const label of ["All", "Unread", "Failed", "Running", "Paused"]) assert.match(out, new RegExp(`>${label}<`));
  assert.match(out, /Recent activity/);
  assert.doesNotMatch(out, /Recent runs/);
});

test("a row names its project before the schedule", () => {
  const out = view([auto("a")]);
  assert.ok(out.indexOf("project-tag-text") < out.indexOf("Daily 9:00"));
});
