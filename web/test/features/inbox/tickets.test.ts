import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProject, DashboardProvider, LinearIssue } from "../../../../shared/api.ts";
import { linkedIdentifiers, ticketStart, ticketsWithoutAgent } from "../../../src/features/inbox/tickets.ts";
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
