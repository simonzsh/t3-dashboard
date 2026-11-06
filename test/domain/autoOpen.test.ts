import assert from "node:assert/strict";
import { test } from "bun:test";
import type { Automation, DashboardThread, SessionsUpdate, SharedSessions } from "../../shared/api.ts";
import { SESSIONS_MAX } from "../../shared/sessions.ts";
import { AutoOpen, automationThreadIds } from "../../src/domain/autoOpen.ts";
import { SessionsStore } from "../../src/domain/sessionsStore.ts";

const thread = (id: string, activeRunId: string | null): DashboardThread => ({
  id,
  projectId: "project-1",
  title: id,
  provider: "",
  model: null,
  status: activeRunId ? "running" : "idle",
  settled: false,
  pending: null,
  activeRunId,
  backgroundWork: false,
  pendingTasks: false,
  lastError: null,
  pinned: false,
  lastActivityAt: "2026-03-20T12:00:00.000Z",
});

function setup(initial: SharedSessions | null = null, excluded: string[] = []) {
  const saved: SharedSessions[] = [];
  const events: SessionsUpdate[] = [];
  const sessions = new SessionsStore(initial, (value) => void saved.push(value));
  let failing = false;
  const auto = new AutoOpen({
    sessions,
    excluded: async () => {
      if (failing) throw new Error("T3 is down");
      return new Set(excluded);
    },
    broadcast: (event) => events.push(event),
    warn: () => {},
  });
  // The work runs on a promise chain: a resolved call after observe waits for it.
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { sessions, saved, events, auto, settle, fail: (value: boolean) => (failing = value) };
}

test("a new run adds its thread, saves and broadcasts like a POST", async () => {
  const { sessions, saved, events, auto, settle } = setup({ ids: ["a"] });
  auto.observe([thread("b", "run-1"), thread("c", null)]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: ["a", "b"] });
  assert.deepEqual(saved, [{ ids: ["a", "b"] }]);
  assert.deepEqual(events, [{ sessions: { ids: ["a", "b"] }, origin: "server" }]);
});

test("sessions never saved start from an empty set", async () => {
  const { sessions, auto, settle } = setup(null);
  auto.observe([thread("a", "run-1")]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: ["a"] });
});

test("the same run after a close does not add the thread again", async () => {
  const { sessions, events, auto, settle } = setup();
  auto.observe([thread("a", "run-1")]);
  await settle();
  sessions.set({ ids: [] });
  auto.observe([thread("a", "run-1")]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: [] });
  assert.equal(events.length, 1);
});

test("a new run after a close adds the thread again", async () => {
  const { sessions, auto, settle } = setup();
  auto.observe([thread("a", "run-1")]);
  await settle();
  sessions.set({ ids: [] });
  auto.observe([thread("a", null)]);
  auto.observe([thread("a", "run-2")]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: ["a"] });
});

test("a thread already open is not saved or broadcast again", async () => {
  const { saved, events, auto, settle } = setup({ ids: ["a"] });
  auto.observe([thread("a", "run-1")]);
  await settle();
  assert.deepEqual([saved, events], [[], []]);
});

test("automation threads never open", async () => {
  const { sessions, auto, settle } = setup({ ids: [] }, ["routine-run"]);
  auto.observe([thread("routine-run", "run-1"), thread("chat", "run-1")]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: ["chat"] });
});

test("a failed automation lookup adds nothing and the next update tries again", async () => {
  const { sessions, auto, settle, fail } = setup({ ids: [] });
  fail(true);
  auto.observe([thread("a", "run-1")]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: [] });
  fail(false);
  auto.observe([thread("a", "run-1")]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: ["a"] });
});

test("a forgotten thread opens again with the same run id", async () => {
  const { sessions, auto, settle } = setup();
  auto.observe([thread("a", "run-1")]);
  await settle();
  sessions.set({ ids: [] });
  auto.forget(["a"]);
  auto.observe([thread("a", "run-1")]);
  await settle();
  assert.deepEqual(sessions.get(), { ids: ["a"] });
});

test("full sessions skip the new thread and keep every open one", async () => {
  const full = Array.from({ length: SESSIONS_MAX }, (_, i) => `t${i}`);
  const { sessions, saved, auto, settle } = setup({ ids: full });
  auto.observe([thread("new", "run-1")]);
  await settle();
  assert.deepEqual(sessions.get()?.ids, full);
  assert.deepEqual(saved, []);
});

test("automation threads: run and setup threads, and the own thread of a bound task (a webhook's conversation)", () => {
  const task = (id: string, threadId: string | null, bound: boolean) => ({ id, threadId, bound }) as Automation;
  const ids = automationThreadIds({
    automations: [task("webhook", "pr-review", true), task("routine", "latest-run", false)],
    hiddenThreadIds: ["latest-run", "older-run"],
    setupThreadIds: ["setup"],
  });
  assert.deepEqual([...ids].sort(), ["latest-run", "older-run", "pr-review", "setup"]);
});
