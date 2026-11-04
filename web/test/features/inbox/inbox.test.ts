import { test } from "bun:test";
import assert from "node:assert/strict";
import { RECENT_SETTLED_MS, inboxSections, nothingToDo } from "../../../src/features/inbox/inbox.ts";
import { thread } from "../../fixtures.ts";

const now = new Date("2026-01-12T12:00:00.000Z");
const ask = { requestId: "r", kind: "command", category: "approval" as const };
const ids = (list: Array<{ id: string }>) => list.map((t) => t.id);

test("every thread lands in exactly one section", () => {
  const s = inboxSections(
    [
      thread("wait", { status: "waiting", pending: ask }),
      thread("err", { status: "failed", lastError: "boom" }),
      thread("done", { status: "completed" }),
      thread("idle"),
      thread("run", { status: "running" }),
      thread("old", { settled: true, status: "completed" }),
    ],
    now,
  );
  assert.deepEqual(ids(s.waiting), ["wait"]);
  assert.deepEqual(ids(s.errors), ["err"]);
  assert.deepEqual(new Set(ids(s.finished)), new Set(["done", "idle"]));
  assert.deepEqual(ids(s.running), ["run"]);
  assert.deepEqual(ids(s.settled), ["old"]);
});

test("a pending thread waits even when settled", () => {
  const s = inboxSections([thread("a", { settled: true, pending: ask, status: "waiting" })], now);
  assert.deepEqual(ids(s.waiting), ["a"]);
  assert.equal(s.settled.length, 0);
});

test("a settled thread that runs stays visible under running", () => {
  const s = inboxSections([thread("a", { settled: true, status: "running" })], now);
  assert.deepEqual(ids(s.running), ["a"]);
  assert.equal(s.settled.length, 0);
});

test("a settled error goes to settled, not to errors", () => {
  const s = inboxSections([thread("a", { settled: true, status: "failed", lastError: "x" })], now);
  assert.equal(s.errors.length, 0);
  assert.deepEqual(ids(s.settled), ["a"]);
});

test("settled threads older than 3 days are dropped", () => {
  const at = (ms: number) => new Date(now.getTime() - ms).toISOString();
  const s = inboxSections(
    [thread("fresh", { settled: true, lastActivityAt: at(RECENT_SETTLED_MS - 1000) }), thread("stale", { settled: true, lastActivityAt: at(RECENT_SETTLED_MS + 1000) })],
    now,
  );
  assert.deepEqual(ids(s.settled), ["fresh"]);
});

test("an unsettled idle thread is finished", () => {
  assert.deepEqual(ids(inboxSections([thread("a")], now).finished), ["a"]);
});

test("each section lists pinned threads first, then the most recent", () => {
  const s = inboxSections(
    [
      thread("old", { lastActivityAt: "2026-01-10T10:00:00.000Z" }),
      thread("new", { lastActivityAt: "2026-01-11T10:00:00.000Z" }),
      thread("pin", { pinned: true, lastActivityAt: "2026-01-09T10:00:00.000Z" }),
    ],
    now,
  );
  assert.deepEqual(ids(s.finished), ["pin", "new", "old"]);
});

test("nothingToDo counts waiting, errors, finished and tickets, not running or settled", () => {
  const quiet = inboxSections([thread("run", { status: "running" }), thread("s", { settled: true })], now);
  assert.equal(nothingToDo(quiet, 0), true);
  assert.equal(nothingToDo(quiet, 1), false);
  assert.equal(nothingToDo(inboxSections([thread("a")], now), 0), false);
});
