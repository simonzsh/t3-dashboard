import { test } from "bun:test";
import assert from "node:assert/strict";
import { applyEvent } from "../../src/api/events.ts";
import { baseState, thread } from "../fixtures.ts";

test("state event replaces everything", () => {
  const next = baseState([thread("thread-1")]);
  assert.equal(applyEvent(baseState([thread("old")]), { type: "state", data: next }), next);
});

test("events before the first state are ignored", () => {
  const diff = { upserted: [thread("thread-1")], removed: [] };
  assert.equal(applyEvent(null, { type: "threads", data: diff }), null);
  assert.equal(applyEvent(null, { type: "providers", data: [] }), null);
});

test("threads upsert replaces by id without duplicates and adds new ones", () => {
  const s = baseState([thread("thread-1"), thread("thread-2")]);
  const out = applyEvent(s, {
    type: "threads",
    data: { upserted: [thread("thread-1", { title: "Renamed" }), thread("thread-3")], removed: [] },
  })!;
  assert.deepEqual(out.threads.map((t) => t.id).sort(), ["thread-1", "thread-2", "thread-3"]);
  assert.equal(out.threads.find((t) => t.id === "thread-1")?.title, "Renamed");
});

test("threads removal is applied", () => {
  const s = baseState([thread("thread-1"), thread("thread-2")]);
  const out = applyEvent(s, { type: "threads", data: { upserted: [], removed: ["thread-1"] } })!;
  assert.deepEqual(out.threads.map((t) => t.id), ["thread-2"]);
});

test("projects diff upserts and removes", () => {
  const s = baseState();
  const out = applyEvent(s, {
    type: "projects",
    data: { upserted: [{ id: "project-b", title: "Project B", defaultModelSelection: null, icon: null }], removed: ["project-a"] },
  })!;
  assert.deepEqual(out.projects.map((p) => p.id), ["project-b"]);
});

test("providers and connection are replaced", () => {
  const s = baseState();
  const p = applyEvent(s, { type: "providers", data: [{ instanceId: "provider-a", displayName: "A", models: [], runtimeModes: ["full-access"] }] })!;
  assert.equal(p.providers.length, 1);
  const c = applyEvent(s, { type: "connection", data: { ...s.connection, t3: "offline" } })!;
  assert.equal(c.connection.t3, "offline");
});

test("input state is not mutated", () => {
  const s = baseState([thread("thread-1")]);
  const copy = structuredClone(s);
  applyEvent(s, { type: "threads", data: { upserted: [thread("thread-2")], removed: ["thread-1"] } });
  assert.deepEqual(s, copy);
});
