import assert from "node:assert/strict";
import { test } from "bun:test";
import { ShellStore } from "../src/shellStore.ts";
import type { DashboardProject, DashboardState, DashboardThread, Diff } from "../shared/api.ts";
import type { RawProject, RawThread, ShellItem } from "../src/integrations/t3/schemas.ts";

const now = new Date("2026-03-20T12:00:00.000Z");
const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * 3_600_000).toISOString();
const raw = (id: string, extra: Partial<RawThread> = {}): RawThread => ({ id, projectId: "project-1", title: id, status: "idle", createdAt: iso(1000), ...extra });
const snapshot = (threads: RawThread[], projects: RawProject[] = []): ShellItem => ({ kind: "snapshot", snapshot: { threads, projects } });

const connection = { t3: "live", origin: null, serverVersion: null, protocolMismatch: false, error: null, since: "x", setup: null } as const;

function setup() {
  const states: DashboardState[] = [];
  const threads: Array<Diff<DashboardThread>> = [];
  const projects: Array<Diff<DashboardProject>> = [];
  const store = new ShellStore({
    now: () => now,
    onState: () => states.push(store.state(connection, [], true)),
    onThreads: (diff) => threads.push(diff),
    onProjects: (diff) => projects.push(diff),
  });
  return { store, states, threads, projects };
}

test("snapshots merge by id while syncing and no state is emitted before synchronized", () => {
  const { store, states } = setup();
  store.beginSync();
  store.apply([snapshot([raw("thread-1"), raw("thread-2")], [{ id: "project-1", title: "Project A" }]), snapshot([raw("thread-2", { title: "Renamed" }), raw("thread-3")])]);
  assert.equal(states.length, 0);
  assert.deepEqual(store.state(connection, [], true).threads, []);
  store.apply([{ kind: "synchronized" }]);
  assert.equal(states.length, 1);
  const titles = states[0]!.threads.map((thread) => thread.title).sort();
  assert.deepEqual(titles, ["Renamed", "thread-1", "thread-3"]);
  assert.deepEqual(states[0]!.projects, [{ id: "project-1", title: "Project A", defaultModelSelection: null }]);
});

test("the first non-snapshot item commits the sync and is then applied live", () => {
  const { store, states, threads } = setup();
  store.beginSync();
  store.apply([snapshot([raw("thread-1")])]);
  store.apply([{ kind: "thread.updated", thread: raw("thread-1", { title: "Edited" }) }]);
  assert.equal(states.length, 1);
  assert.equal(states[0]!.threads[0]!.title, "thread-1");
  assert.equal(threads.length, 1);
  assert.equal(threads[0]!.upserted[0]!.title, "Edited");
});

test("beginSync again replaces the live maps with the new staging maps", () => {
  const { store, states } = setup();
  store.beginSync();
  store.apply([snapshot([raw("thread-1"), raw("thread-2")]), { kind: "synchronized" }]);
  store.beginSync();
  store.apply([snapshot([raw("thread-2")]), { kind: "synchronized" }]);
  assert.deepEqual(states.at(-1)!.threads.map((thread) => thread.id), ["thread-2"]);
});

test("hidden threads never reach the state", () => {
  const { store, states } = setup();
  store.beginSync();
  store.apply([
    snapshot([
      raw("keep"),
      raw("sub", { lineage: { relationshipToParent: "subagent" }, creationSource: "provider" }),
      raw("gone", { deletedAt: iso(1) }),
      raw("old", { archivedAt: iso(1) }),
    ]),
    { kind: "synchronized" },
  ]);
  assert.deepEqual(states[0]!.threads.map((thread) => thread.id), ["keep"]);
});

test("state sorts threads by lastActivityAt descending", () => {
  const { store, states } = setup();
  store.beginSync();
  store.apply([snapshot([raw("old", { createdAt: iso(50) }), raw("new", { createdAt: iso(2) }), raw("mid", { createdAt: iso(10) })]), { kind: "synchronized" }]);
  assert.deepEqual(states[0]!.threads.map((thread) => thread.id), ["new", "mid", "old"]);
});

function live() {
  const ctx = setup();
  ctx.store.beginSync();
  ctx.store.apply([snapshot([raw("thread-1"), raw("thread-2")], [{ id: "project-1", title: "Project A" }]), { kind: "synchronized" }]);
  return ctx;
}

test("thread.updated upserts and emits one diff", () => {
  const { store, threads } = live();
  store.apply([{ kind: "thread.updated", thread: raw("thread-3"), location: "active" }]);
  assert.equal(threads.length, 1);
  assert.deepEqual(threads[0]!.upserted.map((thread) => thread.id), ["thread-3"]);
  assert.deepEqual(threads[0]!.removed, []);
});

test("thread.updated with location archive removes the thread", () => {
  const { store, threads } = live();
  store.apply([{ kind: "thread.updated", thread: raw("thread-1"), location: "archive" }]);
  assert.deepEqual(threads[0], { upserted: [], removed: ["thread-1"] });
  assert.equal(store.thread("thread-1"), undefined);
});

test("thread.updated that hides a thread (archivedAt, deletedAt, subagent) removes it", () => {
  const { store, threads } = live();
  store.apply([{ kind: "thread.updated", thread: raw("thread-1", { archivedAt: iso(1) }) }]);
  store.apply([{ kind: "thread.updated", thread: raw("thread-2", { deletedAt: iso(1) }) }]);
  assert.deepEqual(threads.map((diff) => diff.removed), [["thread-1"], ["thread-2"]]);
});

test("a hidden thread unknown to the store emits nothing", () => {
  const { store, threads } = live();
  store.apply([{ kind: "thread.updated", thread: raw("unknown", { archivedAt: iso(1) }) }]);
  assert.equal(threads.length, 0);
});

test("thread.removed removes and ignores unknown ids", () => {
  const { store, threads } = live();
  store.apply([{ kind: "thread.removed", threadId: "thread-2" }, { kind: "thread.removed", threadId: "nope" }]);
  assert.deepEqual(threads, [{ upserted: [], removed: ["thread-2"] }]);
});

test("a live snapshot merges by id and emits a diff", () => {
  const { store, threads } = live();
  store.apply([snapshot([raw("thread-2", { title: "Changed" }), raw("thread-9")])]);
  assert.deepEqual(threads[0]!.upserted.map((thread) => thread.id).sort(), ["thread-2", "thread-9"]);
  assert.equal(store.state(connection, [], true).threads.length, 3);
});

test("several items in one call give one diff", () => {
  const { store, threads } = live();
  store.apply([
    { kind: "thread.updated", thread: raw("thread-5") },
    { kind: "thread.updated", thread: raw("thread-6") },
    { kind: "thread.removed", threadId: "thread-1" },
  ]);
  assert.equal(threads.length, 1);
  assert.equal(threads[0]!.upserted.length, 2);
  assert.deepEqual(threads[0]!.removed, ["thread-1"]);
});

test("a removal after an upsert in the same call cancels the upsert", () => {
  const { store, threads } = live();
  store.apply([{ kind: "thread.updated", thread: raw("thread-7") }, { kind: "thread.removed", threadId: "thread-7" }]);
  assert.deepEqual(threads[0], { upserted: [], removed: ["thread-7"] });
});

test("project.updated and project.removed", () => {
  const { store, projects } = live();
  store.apply([{ kind: "project.updated", project: { id: "project-2", title: "Project B", defaultModelSelection: { instanceId: "provider-a", model: "model-x" } } }]);
  assert.deepEqual(projects[0], {
    upserted: [{ id: "project-2", title: "Project B", defaultModelSelection: { instanceId: "provider-a", model: "model-x" } }],
    removed: [],
  });
  store.apply([{ kind: "project.removed", projectId: "project-1" }]);
  assert.deepEqual(projects[1], { upserted: [], removed: ["project-1"] });
  assert.deepEqual(store.state(connection, [], true).projects.map((project) => project.id), ["project-2"]);
});

test("unknown kinds are ignored", () => {
  const { store, threads, projects, states } = live();
  store.apply([{ kind: "something.new" } as unknown as ShellItem]);
  assert.equal(threads.length + projects.length, 0);
  assert.equal(states.length, 1);
});

test("reclassify re-emits a settled thread when its snooze ends", () => {
  const ctx = setup();
  const snoozed = raw("snoozed", { settledOverride: "settled", snoozedUntil: iso(-1) });
  ctx.store.beginSync();
  ctx.store.apply([snapshot([snoozed, raw("steady", { status: "completed", latestRunCompletedAt: iso(1) })]), { kind: "synchronized" }]);
  assert.equal(ctx.store.thread("snoozed")!.settled, false);
  ctx.store.reclassify(new Date(now.getTime() + 2 * 3_600_000));
  assert.deepEqual(ctx.threads.map((diff) => diff.upserted.map((thread) => [thread.id, thread.settled])), [[["snoozed", true]]]);
  ctx.store.reclassify(new Date(now.getTime() + 2 * 3_600_000));
  assert.equal(ctx.threads.length, 1);
});

test("state carries connection and providers", () => {
  const { store } = live();
  const state = store.state(connection, [{ instanceId: "provider-a", displayName: "Provider A", models: [], runtimeModes: ["full-access"] }], true);
  assert.equal(state.connection, connection);
  assert.equal(state.providers.length, 1);
});

test("project() finds a project by id first, then by exact title", () => {
  const { store } = setup();
  store.beginSync();
  store.apply([snapshot([], [{ id: "project-1", title: "Project A" }, { id: "Project A", title: "Project B" }]), { kind: "synchronized" }]);
  assert.equal(store.project("project-1")?.title, "Project A");
  assert.equal(store.project("Project A")?.id, "Project A");
  assert.equal(store.project("Project B")?.id, "Project A");
  assert.equal(store.project("Missing"), undefined);
  assert.equal(store.project(""), undefined);
});

test("state carries whether automations are available", () => {
  const { store } = setup();
  assert.equal(store.state(connection, [], true).automationsAvailable, true);
  assert.equal(store.state(connection, [], false).automationsAvailable, false);
  assert.equal(store.state(connection, [], true).t3EnvironmentId, null);
  assert.equal(store.state(connection, [], true, "env-1").t3EnvironmentId, "env-1");
});
