import { test } from "bun:test";
import assert from "node:assert/strict";
import { groupAgents, pendingLabel, providerKind, threadTitle } from "../../src/lib/threads.ts";
import { agentStatus, runActive, threadState } from "../../../shared/status.ts";
import { thread } from "../fixtures.ts";

const now = new Date("2026-03-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const pending = { requestId: "r", kind: "command", category: "approval" as const };

test("agentStatus: pending wins over a running status", () => {
  assert.equal(agentStatus(thread("1", { pending, status: "running" })), "waiting");
});

test("agentStatus: active statuses are working", () => {
  for (const status of ["preparing", "queued", "starting", "running"]) {
    assert.equal(agentStatus(thread("1", { status })), "working", status);
  }
});

test("agentStatus: finished threads stay, whatever their age", () => {
  for (const status of ["completed", "interrupted", "failed", "cancelled", "rolled_back"]) {
    assert.equal(agentStatus(thread("1", { status, lastActivityAt: hoursAgo(23) })), "finished", status);
    assert.equal(agentStatus(thread("1", { status, lastActivityAt: hoursAgo(24 * 30) })), "finished", status);
  }
});

test("agentStatus: other threads are idle", () => {
  assert.equal(agentStatus(thread("1", { status: "idle", lastActivityAt: hoursAgo(1) })), "idle");
});

const projects = [
  { id: "p1", title: "Alpha", defaultModelSelection: null },
  { id: "p2", title: "Beta", defaultModelSelection: null },
  { id: "p3", title: "Gamma", defaultModelSelection: null },
  { id: "p4", title: "Empty", defaultModelSelection: null },
];

test("groupAgents keeps idle threads as cards", () => {
  const [group] = groupAgents([thread("1", { projectId: "p1", status: "idle" })], projects, now);
  assert.deepEqual(group?.cards.map((c) => c.status), ["idle"]);
  assert.deepEqual(group?.settled, []);
});

test("groupAgents puts recent settled threads in their own list, most recent first", () => {
  const ts = [
    thread("older", { projectId: "p1", status: "completed", settled: true, lastActivityAt: hoursAgo(24 * 2.5) }),
    thread("card", { projectId: "p1", status: "completed", lastActivityAt: hoursAgo(1) }),
    thread("new", { projectId: "p1", status: "idle", settled: true, lastActivityAt: hoursAgo(24 * 2) }),
  ];
  const [group] = groupAgents(ts, projects, now);
  assert.deepEqual(group?.cards.map((c) => c.thread.id), ["card"]);
  assert.deepEqual(group?.settled.map((t) => t.id), ["new", "older"]);
});

test("groupAgents hides settled threads older than 3 days, and projects left empty", () => {
  const ts = [
    thread("old", { projectId: "p1", status: "completed", settled: true, lastActivityAt: hoursAgo(24 * 3 + 1) }),
    thread("gone", { projectId: "p2", status: "idle", settled: true, lastActivityAt: hoursAgo(24 * 9) }),
    thread("card", { projectId: "p1", status: "completed", lastActivityAt: hoursAgo(24 * 9) }),
  ];
  const groups = groupAgents(ts, projects, now);
  assert.deepEqual(groups.map((g) => g.project.id), ["p1"]);
  assert.deepEqual(groups[0]?.settled, []);
  assert.deepEqual(groups[0]?.cards.map((c) => c.thread.id), ["card"]);
});

test("groupAgents keeps a waiting or working thread as a card even if settled", () => {
  const ts = [thread("w", { projectId: "p1", pending, settled: true }), thread("r", { projectId: "p1", status: "running", settled: true })];
  const [group] = groupAgents(ts, projects, now);
  assert.deepEqual(group?.cards.map((c) => c.thread.id), ["w", "r"]);
  assert.deepEqual(group?.settled, []);
});

test("groupAgents shows projects with only settled threads after the others", () => {
  const ts = [
    thread("s", { projectId: "p1", status: "completed", settled: true, lastActivityAt: hoursAgo(0.5) }),
    thread("c", { projectId: "p2", status: "idle", lastActivityAt: hoursAgo(24 * 5) }),
  ];
  const groups = groupAgents(ts, projects, now);
  assert.deepEqual(groups.map((g) => g.project.id), ["p2", "p1"]);
  assert.deepEqual(groups[1]?.cards, []);
});

test("groupAgents sorts cards waiting > working > finished > idle, then recency", () => {
  const ts = [
    thread("fin-new", { status: "completed", lastActivityAt: hoursAgo(1) }),
    thread("fin-old", { status: "completed", lastActivityAt: hoursAgo(5) }),
    thread("work-old", { status: "running", lastActivityAt: hoursAgo(3) }),
    thread("work-new", { status: "running", lastActivityAt: hoursAgo(2) }),
    thread("wait", { pending, status: "running", lastActivityAt: hoursAgo(10) }),
    thread("idle", { status: "idle", lastActivityAt: hoursAgo(0.5) }),
  ];
  const [group] = groupAgents(ts, projects, now);
  assert.deepEqual(group?.cards.map((c) => c.thread.id), ["wait", "work-new", "work-old", "fin-new", "fin-old", "idle"]);
  assert.deepEqual(group?.cards.map((c) => c.status), ["waiting", "working", "working", "finished", "finished", "idle"]);
});

test("groupAgents sorts projects: waiting, then working, then latest activity", () => {
  const ts = [
    thread("a", { projectId: "p1", status: "completed", lastActivityAt: hoursAgo(1) }),
    thread("b", { projectId: "p2", status: "running", lastActivityAt: hoursAgo(9) }),
    thread("c", { projectId: "p3", pending, lastActivityAt: hoursAgo(20) }),
  ];
  assert.deepEqual(groupAgents(ts, projects, now).map((g) => g.project.id), ["p3", "p2", "p1"]);
  const tie = [
    thread("a", { projectId: "p1", status: "completed", lastActivityAt: hoursAgo(4) }),
    thread("b", { projectId: "p2", status: "completed", lastActivityAt: hoursAgo(2) }),
  ];
  assert.deepEqual(groupAgents(tie, projects, now).map((g) => g.project.id), ["p2", "p1"]);
  // A finished card can carry a project's latest activity even behind an older working card.
  const mixed = [
    thread("a1", { projectId: "p1", status: "running", lastActivityAt: hoursAgo(2) }),
    thread("a2", { projectId: "p1", status: "completed", lastActivityAt: hoursAgo(0.1) }),
    thread("b1", { projectId: "p2", status: "running", lastActivityAt: hoursAgo(1) }),
  ];
  assert.deepEqual(groupAgents(mixed, projects, now).map((g) => g.project.id), ["p1", "p2"]);
});

test("groupAgents falls back to the project id when the project is unknown", () => {
  const [group] = groupAgents([thread("1", { projectId: "ghost", status: "running" })], projects, now);
  assert.equal(group?.project.title, "ghost");
});

test("providerKind recognises the two providers and falls back", () => {
  assert.equal(providerKind("claudeAgent"), "claude");
  assert.equal(providerKind("codex"), "codex");
  assert.equal(providerKind("codex_work"), "codex");
  assert.equal(providerKind("other"), "other");
});

test("pendingLabel names the kind of request", () => {
  assert.equal(pendingLabel("approval"), "Approval");
  assert.equal(pendingLabel("user-input"), "Question");
  assert.equal(pendingLabel("other"), "Action required");
});

test("a finished turn with subagents still running stays working", () => {
  const busy = thread("1", { status: "completed", backgroundWork: true, lastActivityAt: hoursAgo(1) });
  assert.equal(agentStatus(busy), "working");
  assert.equal(threadState(busy), "running");
  assert.equal(threadState(thread("1", { pending, status: "completed", backgroundWork: true })), "waiting");
});

test("runActive: an active status or run id, but not background work alone", () => {
  assert.equal(runActive(thread("1", { status: "running" })), true);
  assert.equal(runActive(thread("1", { status: "idle", activeRunId: "run-1" })), true);
  assert.equal(runActive(thread("1", { status: "completed", backgroundWork: true })), false);
});

test("threadState gives the desk window colour", () => {
  assert.equal(threadState(thread("1", { pending, status: "running" })), "waiting");
  assert.equal(threadState(thread("1", { status: "running" })), "running");
  assert.equal(threadState(thread("1", { status: "completed" })), "done");
  assert.equal(threadState(thread("1", { status: "failed" })), "error");
  assert.equal(threadState(thread("1", { status: "completed", lastError: "boom" })), "error");
  assert.equal(threadState(thread("1", { status: "idle" })), "idle");
});

test("threadTitle falls back to (untitled) for an empty title or no thread", () => {
  assert.equal(threadTitle(thread("a", { title: "Fix it" })), "Fix it");
  assert.equal(threadTitle(thread("a", { title: "" })), "(untitled)");
  assert.equal(threadTitle(null), "(untitled)");
});
