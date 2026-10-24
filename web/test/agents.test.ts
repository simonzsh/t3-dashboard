import test from "node:test";
import assert from "node:assert/strict";
import { agentStatus, groupAgents, pendingLabel, providerKind } from "../src/agents.ts";
import { thread } from "./fixtures.ts";

const now = new Date("2026-03-01T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();
const pending = { requestId: "r", kind: "command", category: "approval" as const };

test("agentStatus: pending wins over a running status", () => {
  assert.equal(agentStatus(thread("1", { pending, status: "running" }), now), "waiting");
});

test("agentStatus: active statuses are working", () => {
  for (const status of ["preparing", "queued", "starting", "running"]) {
    assert.equal(agentStatus(thread("1", { status }), now), "working", status);
  }
});

test("agentStatus: finished only within 24 hours", () => {
  for (const status of ["completed", "interrupted", "failed", "cancelled", "rolled_back"]) {
    assert.equal(agentStatus(thread("1", { status, lastActivityAt: hoursAgo(23) }), now), "finished", status);
    assert.equal(agentStatus(thread("1", { status, lastActivityAt: hoursAgo(25) }), now), null, status);
  }
});

test("agentStatus: idle threads are hidden", () => {
  assert.equal(agentStatus(thread("1", { status: "idle", lastActivityAt: hoursAgo(1) }), now), null);
});

const projects = [
  { id: "p1", title: "Alpha", defaultModelSelection: null },
  { id: "p2", title: "Beta", defaultModelSelection: null },
  { id: "p3", title: "Gamma", defaultModelSelection: null },
  { id: "p4", title: "Empty", defaultModelSelection: null },
];

test("groupAgents drops projects without a visible card", () => {
  const out = groupAgents([thread("1", { projectId: "p1", status: "idle" })], projects, now);
  assert.deepEqual(out, []);
});

test("groupAgents sorts cards waiting > working > finished, then recency", () => {
  const ts = [
    thread("fin-new", { status: "completed", lastActivityAt: hoursAgo(1) }),
    thread("fin-old", { status: "completed", lastActivityAt: hoursAgo(5) }),
    thread("work-old", { status: "running", lastActivityAt: hoursAgo(3) }),
    thread("work-new", { status: "running", lastActivityAt: hoursAgo(2) }),
    thread("wait", { pending, status: "running", lastActivityAt: hoursAgo(10) }),
  ];
  const [group] = groupAgents(ts, projects, now);
  assert.deepEqual(group?.cards.map((c) => c.thread.id), ["wait", "work-new", "work-old", "fin-new", "fin-old"]);
  assert.deepEqual(group?.cards.map((c) => c.status), ["waiting", "working", "working", "finished", "finished"]);
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
  assert.equal(pendingLabel("approval"), "Approbation");
  assert.equal(pendingLabel("user-input"), "Question");
  assert.equal(pendingLabel("other"), "Action requise");
});
