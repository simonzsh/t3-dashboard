import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Automation, AutomationRun } from "../../../../shared/api.ts";
import { AutomationPanel } from "../../../src/features/automations/AutomationPanel.tsx";
import { RecentRuns } from "../../../src/features/automations/RecentRuns.tsx";
import { thread } from "../../fixtures.ts";

const NOW = new Date("2026-01-10T12:00:00.000Z");
const SEEN = { since: "2026-01-10T11:00:00.000Z", seen: { "t-read": "2026-01-10T10:00:00.000Z" } };

const run = (threadId: string | null, startedAt: string, over: Partial<AutomationRun> = {}): AutomationRun => ({ threadId, startedAt, finishedAt: null, status: "succeeded", error: null, ...over });
const auto = (runs: AutomationRun[]): Automation => ({
  id: "a", kind: "routine", title: "Inbox triage", projectId: "project-a", project: "Project A", scheduleLabel: "Daily 9:00", enabled: true, nextRunAt: null, lastRunAt: null, lastRunStatus: null, lastRunError: null,
  threadId: null, modelSelection: null, prompt: "Do it", schedule: null, runtimeMode: null, bound: false, webhook: null, runs,
});
const threads = new Map([
  ["t-new", thread("t-new", { status: "completed", lastActivityAt: "2026-01-10T11:30:00.000Z" })],
  ["t-read", thread("t-read", { status: "failed", lastError: "boom", lastActivityAt: "2026-01-10T09:00:00.000Z" })],
]);
const panel = (a: Automation) => renderToStaticMarkup(<AutomationPanel automation={a} threads={threads} project={undefined} providers={[]} seen={SEEN} now={NOW} compact={false} onClose={() => {}} onOpen={() => {}} onEdit={() => {}} onDelete={() => {}} />);

test("the panel lists each run with its badge, an unread dot and an Open button", () => {
  const out = panel(auto([run("t-new", "2026-01-10T11:00:00.000Z"), run("t-read", "2026-01-10T08:00:00.000Z")]));
  assert.equal(out.match(/auto-history-row/g)?.length, 2);
  assert.equal(out.match(/>Open<\/button>/g)?.length, 2);
  assert.equal(out.match(/aria-label="Unread"/g)?.length, 1);
  assert.match(out, /data-tooltip="boom"/);
});

test("a run whose session is gone shows Session archived, with no Open button", () => {
  const out = panel(auto([run("t-gone", "2026-01-10T08:00:00.000Z")]));
  assert.match(out, /Session archived/);
  assert.doesNotMatch(out, />Open<\/button>/);
});

test("a run that never got a session shows No session", () => {
  assert.match(panel(auto([run(null, "2026-01-10T08:00:00.000Z", { status: "failed", error: "no slot" })])), /No session/);
});

test("the panel says so when the task never ran", () => {
  assert.match(panel(auto([])), /No runs yet/);
});

test("a phone panel has a back button, a wide one a close button", () => {
  assert.match(panel(auto([])), /aria-label="Close the panel"/);
  const phone = renderToStaticMarkup(<AutomationPanel automation={auto([])} threads={threads} project={undefined} providers={[]} seen={SEEN} now={NOW} compact onClose={() => {}} onOpen={() => {}} onEdit={() => {}} onDelete={() => {}} />);
  assert.match(phone, /aria-label="Back to the list"/);
});

test("recent runs open a run with a session, and show a run without one as plain text", () => {
  const a = auto([]);
  const out = renderToStaticMarkup(
    <RecentRuns
      runs={[
        { automation: a, run: run("t-new", "2026-01-10T11:00:00.000Z") },
        { automation: a, run: run(null, "2026-01-10T10:00:00.000Z", { status: "failed", error: "no slot" }) },
      ]}
      threads={threads}
      seen={SEEN}
      now={NOW}
      onOpen={() => {}}
    />,
  );
  assert.equal(out.match(/<button/g)?.length, 1);
  assert.match(out, /auto-recent-row static/);
  assert.match(out, /1 h ago/);
});

test("recent runs render nothing without runs", () => {
  assert.equal(renderToStaticMarkup(<RecentRuns runs={[]} threads={threads} seen={SEEN} now={NOW} onOpen={() => {}} />), "");
});
