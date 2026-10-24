import test from "node:test";
import assert from "node:assert/strict";
import { filterThreads, groupByBucket, BUCKET_LABELS } from "../src/filters.ts";
import { thread } from "./fixtures.ts";

const none = { projectId: null, provider: null, search: "" };

test("combines project, provider and search", () => {
  const ts = [
    thread("1", { projectId: "p1", provider: "provider-a", title: "Alpha" }),
    thread("2", { projectId: "p1", provider: "provider-b", title: "Alpha" }),
    thread("3", { projectId: "p2", provider: "provider-a", title: "Alpha" }),
    thread("4", { projectId: "p1", provider: "provider-a", title: "Beta" }),
  ];
  const out = filterThreads(ts, { projectId: "p1", provider: "provider-a", search: "alp" });
  assert.deepEqual(out.map((t) => t.id), ["1"]);
  assert.equal(filterThreads(ts, none).length, 4);
});

test("search ignores case and accents, and looks in the preview", () => {
  const ts = [
    thread("1", { title: "Révision générale" }),
    thread("2", { title: "x", preview: { role: "assistant", text: "Déploiement terminé" } }),
    thread("3", { title: "autre" }),
  ];
  assert.deepEqual(filterThreads(ts, { ...none, search: "REVISION" }).map((t) => t.id), ["1"]);
  assert.deepEqual(filterThreads(ts, { ...none, search: "deploiement" }).map((t) => t.id), ["2"]);
  assert.deepEqual(filterThreads(ts, { ...none, search: "  " }).length, 3);
});

test("groups by bucket: pinned first, then most recent activity", () => {
  const ts = [
    thread("old", { bucket: "done", lastActivityAt: "2026-01-01T00:00:00Z" }),
    thread("new", { bucket: "done", lastActivityAt: "2026-01-05T00:00:00Z" }),
    thread("pin", { bucket: "done", pinned: true, lastActivityAt: "2025-12-01T00:00:00Z" }),
    thread("run", { bucket: "running" }),
  ];
  const g = groupByBucket(ts);
  assert.deepEqual(g.done.map((t) => t.id), ["pin", "new", "old"]);
  assert.deepEqual(g.running.map((t) => t.id), ["run"]);
  assert.deepEqual(g.todo, []);
  assert.deepEqual(g.inactive, []);
});

test("bucket labels are French", () => {
  assert.deepEqual(BUCKET_LABELS, { todo: "À traiter", running: "En cours", done: "Terminé", inactive: "Inactif" });
});
