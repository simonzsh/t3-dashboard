import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProject, DashboardProvider, LinearIssue } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { IDLE_RELAUNCH_MS, linkedIdentifiers, planTickets, ticketStart, ticketsWithoutAgent } from "../../../src/features/inbox/tickets.ts";
import { thread } from "../../fixtures.ts";

function issue(identifier: string, over: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: `id-${identifier}`,
    identifier,
    title: `Issue ${identifier}`,
    url: `https://linear.example.invalid/${identifier}`,
    state: { name: "Todo", type: "unstarted", color: "#fff" },
    priority: 3,
    priorityLabel: "Medium",
    project: null,
    team: { key: "ABC", name: "Team" },
    updatedAt: "2026-01-10T10:00:00.000Z",
    ...over,
  };
}

test("linkedIdentifiers finds identifiers anywhere in a title, in any case", () => {
  const set = linkedIdentifiers([thread("1", { title: "ABC-123 Fix login" }), thread("2", { title: "Fix login (abc-124)" }), thread("3", { title: "no ticket here" })]);
  assert.deepEqual([...set].sort(), ["ABC-123", "ABC-124"]);
});

test("ABC-1234 does not link ABC-123", () => {
  const open = ticketsWithoutAgent([issue("ABC-123"), issue("ABC-1234")], [thread("1", { title: "ABC-1234 work" })]);
  assert.deepEqual(open.map((i) => i.identifier), ["ABC-123"]);
});

test("settled and hidden threads still link their ticket", () => {
  const open = ticketsWithoutAgent([issue("ABC-1"), issue("ABC-2")], [thread("1", { title: "ABC-1 x", settled: true })]);
  assert.deepEqual(open.map((i) => i.identifier), ["ABC-2"]);
});

test("tickets sort by priority, none last, then most recently updated", () => {
  const open = ticketsWithoutAgent(
    [
      issue("A-1", { priority: 0 }),
      issue("A-2", { priority: 4 }),
      issue("A-3", { priority: 1 }),
      issue("A-4", { priority: 2, updatedAt: "2026-01-09T00:00:00.000Z" }),
      issue("A-5", { priority: 2, updatedAt: "2026-01-11T00:00:00.000Z" }),
    ],
    [],
  );
  assert.deepEqual(open.map((i) => i.identifier), ["A-3", "A-5", "A-4", "A-2", "A-1"]);
});

test("only to do and started tickets count", () => {
  const types = ["triage", "backlog", "unstarted", "started", "completed", "canceled"];
  const open = ticketsWithoutAgent(types.map((type) => issue(`T-${type}`, { state: { name: type, type, color: "#fff" } })), []);
  assert.deepEqual(open.map((i) => i.identifier), ["T-unstarted", "T-started"]);
});

const now = new Date("2026-01-12T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const seen: SeenState = { since: "2026-01-01T00:00:00.000Z", seen: {} };
const readAt = (...threads: Array<{ id: string; lastActivityAt: string }>): SeenState => ({ since: seen.since, seen: Object.fromEntries(threads.map((t) => [t.id, t.lastActivityAt])) });
const started = { name: "In Progress", type: "started", color: "#fff" };
const stale = (id: string, title: string, over = {}) => thread(id, { title, status: "completed", lastActivityAt: ago(IDLE_RELAUNCH_MS + 1000), ...over });
const keys = (items: Array<{ issue: LinearIssue; thread: { id: string } }>) => items.map((r) => [r.issue.identifier, r.thread.id]);

test("tickets without an agent are up next, started ones first", () => {
  const plan = planTickets([issue("A-2", { priority: 1 }), issue("A-1", { state: started, priority: 4 })], [], seen, now);
  assert.equal(plan.relaunch.length, 0);
  assert.deepEqual(plan.upNext.map((i) => i.identifier), ["A-1", "A-2"]);
});

test("a started ticket whose thread is finished, read and idle for over 24 h is to relaunch", () => {
  const t = stale("t1", "A-1 work");
  const plan = planTickets([issue("A-1", { state: started })], [t], readAt(t), now);
  assert.deepEqual(keys(plan.relaunch), [["A-1", "t1"]]);
  assert.equal(plan.upNext.length, 0);
});

test("a linked ticket is not to relaunch while its thread is recent, unread, running, settled or failed", () => {
  const cases = [
    stale("t", "A-1", { lastActivityAt: ago(IDLE_RELAUNCH_MS - 1000) }),
    stale("t", "A-1", { settled: true }),
    stale("t", "A-1", { status: "running" }),
    stale("t", "A-1", { status: "failed", lastError: "x" }),
  ];
  for (const t of cases) assert.equal(planTickets([issue("A-1", { state: started })], [t], readAt(t), now).relaunch.length, 0, JSON.stringify(t));
  assert.equal(planTickets([issue("A-1", { state: started })], [stale("t", "A-1")], seen, now).relaunch.length, 0);
});

test("only the latest thread of a ticket decides", () => {
  const old = stale("old", "A-1 first", { lastActivityAt: ago(IDLE_RELAUNCH_MS * 3) });
  const running = thread("run", { title: "A-1 again", status: "running", lastActivityAt: ago(1000) });
  assert.equal(planTickets([issue("A-1", { state: started })], [old, running], readAt(old), now).relaunch.length, 0);
});

test("a linked ticket in the to do state is neither to relaunch nor up next", () => {
  const t = stale("t", "A-1");
  const plan = planTickets([issue("A-1")], [t], readAt(t), now);
  assert.equal(plan.relaunch.length + plan.upNext.length, 0);
});

test("to relaunch sorts by priority, none last", () => {
  const [t1, t2] = [stale("t1", "A-1 one"), stale("t2", "A-2 two")];
  const plan = planTickets([issue("A-1", { state: started, priority: 0 }), issue("A-2", { state: started, priority: 2 })], [t1, t2], readAt(t1, t2), now);
  assert.deepEqual(keys(plan.relaunch), [["A-2", "t2"], ["A-1", "t1"]]);
});

const projects: DashboardProject[] = [{ id: "p1", title: "P1", defaultModelSelection: null, icon: null }];
const providers: DashboardProvider[] = [{ instanceId: "i1", models: [{ slug: "m1" }] } as DashboardProvider];
const defaults = { selection: null, runtimeMode: null };

test("ticketStart opens the dialog without a saved project", () => {
  assert.deepEqual(ticketStart(issue("ABC-1"), "", projects, providers, defaults), { kind: "dialog" });
});

test("ticketStart opens the dialog when the saved project is gone", () => {
  assert.deepEqual(ticketStart(issue("ABC-1"), "ghost", projects, providers, defaults), { kind: "dialog" });
});

test("ticketStart opens the dialog when no model is offered", () => {
  assert.deepEqual(ticketStart(issue("ABC-1"), "p1", projects, [], defaults), { kind: "dialog" });
});

test("ticketStart starts directly with the preset model and an empty prompt", () => {
  const start = ticketStart(issue("ABC-1"), "p1", projects, providers, defaults);
  assert.deepEqual(start, {
    kind: "direct",
    project: projects[0],
    body: { issueId: "id-ABC-1", projectId: "p1", text: "", modelSelection: { instanceId: "i1", model: "m1" }, runtimeMode: "full-access" },
  });
});

test("ticketStart uses the T3 default access mode", () => {
  const start = ticketStart(issue("ABC-1"), "p1", projects, providers, { selection: null, runtimeMode: "approval-required" });
  assert.equal(start.kind === "direct" && start.body.runtimeMode, "approval-required");
});
