import test from "node:test";
import assert from "node:assert/strict";
import { kpis, byProject, byProvider, byDay } from "../src/stats.ts";
import { thread } from "./fixtures.ts";

test("kpis count buckets and pending categories", () => {
  const ts = [
    thread("1", { bucket: "todo", pending: { requestId: "r1", kind: "command", category: "approval" } }),
    thread("2", { bucket: "todo", pending: { requestId: "r2", kind: "user_input", category: "user-input" } }),
    thread("3", { bucket: "todo", pending: { requestId: "r3", kind: "other", category: "other" } }),
    thread("4", { bucket: "todo" }),
    thread("5", { bucket: "running" }),
    thread("6", { bucket: "done" }),
  ];
  assert.deepEqual(kpis(ts), {
    total: 6,
    buckets: { todo: 4, running: 1, done: 1, inactive: 0 },
    approvals: 1,
    inputs: 1,
  });
});

test("byProject sorts desc and folds beyond 10 into Autres", () => {
  const projects = Array.from({ length: 12 }, (_, i) => ({ id: `p${i}`, title: `Project ${i}`, defaultModelSelection: null }));
  const ts = projects.flatMap((p, i) => Array.from({ length: 12 - i }, (_, k) => thread(`${p.id}-${k}`, { projectId: p.id })));
  const out = byProject(ts, projects);
  assert.equal(out.length, 11);
  assert.deepEqual(out[0], { label: "Project 0", count: 12 });
  assert.deepEqual(out[9], { label: "Project 9", count: 3 });
  assert.deepEqual(out[10], { label: "Autres", count: 2 + 1 });
});

test("byProject keeps at most 10 without Autres, and uses the id for unknown projects", () => {
  const out = byProject([thread("1", { projectId: "ghost" })], []);
  assert.deepEqual(out, [{ label: "ghost", count: 1 }]);
});

test("byProvider counts and sorts desc", () => {
  const ts = [thread("1", { provider: "b" }), thread("2", { provider: "a" }), thread("3", { provider: "a" })];
  assert.deepEqual(byProvider(ts), [{ label: "a", count: 2 }, { label: "b", count: 1 }]);
});

test("byDay is contiguous over 30 days with zeros, by local day", () => {
  const now = new Date(2026, 5, 15, 12, 0, 0);
  const ts = [
    thread("1", { createdAt: new Date(2026, 5, 15, 8).toISOString() }),
    thread("2", { createdAt: new Date(2026, 5, 15, 23, 59).toISOString() }),
    thread("3", { createdAt: new Date(2026, 5, 1, 0, 1).toISOString() }),
    thread("4", { createdAt: new Date(2026, 4, 1).toISOString() }),
  ];
  const out = byDay(ts, now);
  assert.equal(out.length, 30);
  assert.equal(out[29]?.day, "2026-06-15");
  assert.equal(out[0]?.day, "2026-05-17");
  assert.equal(out[29]?.count, 2);
  assert.equal(out.find((d) => d.day === "2026-06-01")?.count, 1);
  assert.equal(out.find((d) => d.day === "2026-06-10")?.count, 0);
  assert.equal(out.reduce((n, d) => n + d.count, 0), 3);
});
