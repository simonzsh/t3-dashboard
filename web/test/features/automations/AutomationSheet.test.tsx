import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { Automation, AutomationRun } from "../../../../shared/api.ts";
import { AutomationRow } from "../../../src/features/automations/AutomationRow.tsx";
import { AutomationSheet } from "../../../src/features/automations/AutomationSheet.tsx";
import { RecentRuns } from "../../../src/features/automations/RecentRuns.tsx";
import { thread } from "../../fixtures.ts";

const NOW = new Date("2026-01-10T12:00:00.000Z");
const SEEN = { since: "2026-01-10T11:00:00.000Z", seen: { "t-read": "2026-01-10T10:00:00.000Z" } };

const run = (threadId: string | null, startedAt: string, over: Partial<AutomationRun> = {}): AutomationRun => ({ threadId, startedAt, finishedAt: null, status: "succeeded", error: null, ...over });
const auto = (runs: AutomationRun[], over: Partial<Automation> = {}): Automation => ({
  id: "a", kind: "routine", title: "Inbox triage", projectId: "project-a", project: "Project A", scheduleLabel: "daily 9:00", enabled: true, nextRunAt: null, lastRunAt: null, lastRunStatus: null, lastRunError: null,
  threadId: null, modelSelection: null, prompt: "Sort the inbox", schedule: null, runtimeMode: null, bound: false, webhook: null, runs, ...over,
});
const threads = new Map([
  ["t-new", thread("t-new", { status: "completed", lastActivityAt: "2026-01-10T11:30:00.000Z" })],
  ["t-read", thread("t-read", { status: "failed", lastError: "boom", lastActivityAt: "2026-01-10T09:00:00.000Z" })],
]);
const noop = () => {};
const sheet = (a: Automation) =>
  renderToStaticMarkup(<AutomationSheet automation={a} threads={threads} project={undefined} providers={[]} seen={SEEN} now={NOW} starting={false} onClose={noop} onOpen={noop} onToggle={noop} onRun={noop} onEdit={noop} onDelete={noop} />);
const row = (a: Automation) =>
  renderToStaticMarkup(<AutomationRow automation={a} threads={threads} seen={SEEN} now={NOW} starting={false} onSelect={noop} onToggle={noop} onRun={noop} onEdit={noop} onDelete={noop} />);

test("the sheet history lists each run with its status, an unread dot and an Open session button", () => {
  const out = sheet(auto([run("t-new", "2026-01-10T11:00:00.000Z"), run("t-read", "2026-01-10T08:00:00.000Z")]));
  assert.equal(out.match(/>Open session<\/button>/g)?.length, 2);
  assert.equal(out.match(/aria-label="Unread"/g)?.length, 1);
  assert.match(out, /Succeeded/);
  assert.match(out, /Failed/);
  assert.match(out, /class="auto-run-error">boom</);
});

test("a run whose session is gone shows Session archived, with no Open session button", () => {
  const out = sheet(auto([run("t-gone", "2026-01-10T08:00:00.000Z")]));
  assert.match(out, /Session archived/);
  assert.doesNotMatch(out, />Open session<\/button>/);
});

test("a run that never got a session shows No session", () => {
  assert.match(sheet(auto([run(null, "2026-01-10T08:00:00.000Z", { status: "failed", error: "no slot" })])), /No session/);
});

test("the sheet says so when the task never ran, and shows the prompt", () => {
  const out = sheet(auto([]));
  assert.match(out, /No runs yet/);
  assert.match(out, /<pre class="auto-prompt">Sort the inbox<\/pre>/);
});

test("the sheet is a labelled dialog with a close button and a switch for the task", () => {
  const out = sheet(auto([]));
  assert.match(out, /role="dialog" aria-modal="true" aria-label="Inbox triage"/);
  assert.match(out, /aria-label="Close"/);
  assert.match(out, /role="switch" aria-checked="true" aria-label="Enable Inbox triage"/);
});

test("the sheet offers Open session for a bound thread", () => {
  assert.match(sheet(auto([], { bound: true, threadId: "t-new" })), /Bound thread/);
  assert.doesNotMatch(sheet(auto([])), /Bound thread/);
});

test("a finished reminder has no switch", () => {
  const done = auto([], { kind: "reminder", enabled: false, lastRunAt: "2026-01-09T09:00:00.000Z" });
  assert.doesNotMatch(sheet(done), /role="switch"/);
  assert.doesNotMatch(row(done), /role="switch"/);
  assert.match(row(done), /Finished/);
});

test("a row shows three lines: name with kind, schedule with next run, last run", () => {
  const out = row(auto([run("t-read", "2026-01-10T08:00:00.000Z", { finishedAt: "2026-01-10T08:03:00.000Z" })], { nextRunAt: "2026-01-10T15:30:00.000Z" }));
  assert.match(out, /Inbox triage/);
  assert.match(out, /Routine/);
  assert.match(out, /Daily 9:00/);
  assert.match(out, /Next in 3 h/);
  assert.match(out, /auto-fail">Failed · 4 h ago · 3 min</);
});

test("a paused row says Paused and is dimmed; a running one disables Run now", () => {
  const paused = row(auto([], { enabled: false }));
  assert.match(paused, /auto-row dim/);
  assert.match(paused, /Paused/);
  assert.match(paused, /Never run/);
  const running = renderToStaticMarkup(
    <AutomationRow automation={auto([run("t-run", "2026-01-10T11:55:00.000Z", { status: "running" })])} threads={new Map([["t-run", thread("t-run", { status: "running" })]])} seen={SEEN} now={NOW} starting={false} onSelect={noop} onToggle={noop} onRun={noop} onEdit={noop} onDelete={noop} />,
  );
  assert.match(running, /aria-label="Run Inbox triage now"[^>]*disabled=""|disabled=""[^>]*aria-label="Run Inbox triage now"/);
});

const many = (n: number) => Array.from({ length: n }, (_, i) => ({ automation: auto([]), run: run("t-new", new Date(NOW.getTime() - i * 60_000).toISOString()) }));
const recent = (n: number) => renderToStaticMarkup(<RecentRuns runs={many(n)} threads={threads} seen={SEEN} now={NOW} onOpen={noop} />);

test("recent runs open a run with a session, and show a run without one as plain text", () => {
  const out = renderToStaticMarkup(
    <RecentRuns runs={[{ automation: auto([]), run: run("t-new", "2026-01-10T11:00:00.000Z") }, { automation: auto([]), run: run(null, "2026-01-10T10:00:00.000Z", { status: "failed", error: "no slot" }) }]} threads={threads} seen={SEEN} now={NOW} onOpen={noop} />,
  );
  assert.equal(out.match(/<button/g)?.length, 1);
  assert.match(out, /auto-run-row static/);
  assert.match(out, /1 h ago/);
  assert.match(out, /Inbox triage/);
});

test("recent runs show 8 rows, then a Show older runs button", () => {
  assert.equal(recent(8).match(/class="auto-run-row/g)?.length, 8);
  assert.doesNotMatch(recent(8), /Show older runs/);
  const out = recent(12);
  assert.equal(out.match(/class="auto-run-row/g)?.length, 8);
  assert.match(out, /Show older runs/);
});

test("recent runs say so without runs", () => {
  assert.match(recent(0), /No runs yet/);
});
