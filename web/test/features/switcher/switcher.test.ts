import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ThreadSearchMatch } from "../../../../shared/api.ts";
import { highlightParts, mergeResults, moveSelection, shouldSearchContent, suggestThreads, titleMatches } from "../../../src/features/switcher/switcher.ts";
import { thread } from "../../fixtures.ts";

const projects = [
  { id: "project-a", title: "Project A", defaultModelSelection: null, icon: null },
  { id: "project-b", title: "Billing", defaultModelSelection: null, icon: null },
];
const match = (threadId: string, snippet = "…hit…", source: ThreadSearchMatch["source"] = "user"): ThreadSearchMatch => ({
  threadId,
  projectId: "project-a",
  source,
  snippet,
  messageCreatedAt: null,
});

const threads = [
  thread("t1", { title: "Fix login bug", lastActivityAt: "2026-01-10T10:00:00.000Z" }),
  thread("t2", { title: "Refactor LOGIN form", lastActivityAt: "2026-01-12T10:00:00.000Z" }),
  thread("t3", { title: "", projectId: "project-b", lastActivityAt: "2026-01-11T10:00:00.000Z" }),
  thread("t4", { title: "Unrelated", lastActivityAt: "2026-01-13T10:00:00.000Z" }),
];

test("titleMatches is case-insensitive and newest activity first", () => {
  assert.deepEqual(titleMatches(threads, projects, "Login").map((r) => r.thread.id), ["t2", "t1"]);
});

test("titleMatches also matches the project title and untitled threads", () => {
  assert.deepEqual(titleMatches(threads, projects, "billing").map((r) => r.thread.id), ["t3"]);
  assert.deepEqual(titleMatches(threads, projects, "untitled").map((r) => r.thread.id), ["t3"]);
});

test("titleMatches ignores an empty query", () => {
  assert.deepEqual(titleMatches(threads, projects, "  "), []);
});

test("a title hit takes the snippet of its content match, once", () => {
  const rows = mergeResults(titleMatches(threads, projects, "login"), [match("t1", "…login…")], threads, projects);
  assert.deepEqual(rows.map((r) => [r.thread.id, r.snippet]), [["t2", undefined], ["t1", "…login…"]]);
});

test("content-only rows follow the title hits in server order", () => {
  const rows = mergeResults(titleMatches(threads, projects, "login"), [match("t4"), match("t3", "x", "assistant"), match("t1")], threads, projects);
  assert.deepEqual(rows.map((r) => r.thread.id), ["t2", "t1", "t4", "t3"]);
  assert.equal(rows[3]?.source, "assistant");
  assert.equal(rows[3]?.project.title, "Billing");
});

test("content matches on threads missing from the state are dropped", () => {
  assert.deepEqual(mergeResults([], [match("gone"), match("t4")], threads, projects).map((r) => r.thread.id), ["t4"]);
});

test("shouldSearchContent wants 2 to 200 characters once trimmed", () => {
  assert.equal(shouldSearchContent("a"), false);
  assert.equal(shouldSearchContent("ab"), true);
  assert.equal(shouldSearchContent("a".repeat(200)), true);
  assert.equal(shouldSearchContent("a".repeat(201)), false);
  assert.equal(shouldSearchContent("  a  "), false);
});

test("moveSelection clamps at both ends and survives an empty list", () => {
  assert.equal(moveSelection(0, -1, 3), 0);
  assert.equal(moveSelection(1, 1, 3), 2);
  assert.equal(moveSelection(2, 1, 3), 2);
  assert.equal(moveSelection(0, 1, 0), 0);
});

const waiting = { pending: { kind: "approval" } } as unknown as Partial<ReturnType<typeof thread>>;
const ids = (rows: { thread: { id: string } }[]) => rows.map((r) => r.thread.id);

test("suggestions: waiting threads first, then history order, then latest activity", () => {
  const all = [
    thread("old", { lastActivityAt: "2026-01-01T00:00:00.000Z" }),
    thread("new", { lastActivityAt: "2026-01-09T00:00:00.000Z" }),
    thread("mid", { lastActivityAt: "2026-01-05T00:00:00.000Z" }),
    thread("h1", { lastActivityAt: "2026-01-02T00:00:00.000Z" }),
    thread("h2", { lastActivityAt: "2026-01-03T00:00:00.000Z" }),
    thread("w", { ...waiting, lastActivityAt: "2026-01-01T00:00:00.000Z" }),
  ];
  assert.deepEqual(ids(suggestThreads(all, projects, ["h2", "h1"], new Set(), 8)), ["w", "h2", "h1", "new", "mid", "old"]);
});

test("suggestions: one row per thread, even when waiting and in the history", () => {
  const all = [thread("a", waiting), thread("b")];
  assert.deepEqual(ids(suggestThreads(all, projects, ["a", "b", "a"], new Set(), 8)), ["a", "b"]);
});

test("suggestions skip the threads visible on the Desk and unknown history ids", () => {
  const all = [thread("a"), thread("b", waiting), thread("c")];
  assert.deepEqual(ids(suggestThreads(all, projects, ["gone", "a"], new Set(["b"]), 8)), ["a", "c"]);
});

test("suggestions stop at the cap", () => {
  const all = Array.from({ length: 12 }, (_, i) => thread(`t${i}`, { lastActivityAt: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` }));
  assert.deepEqual(ids(suggestThreads(all, projects, [], new Set(), 8)), ["t11", "t10", "t9", "t8", "t7", "t6", "t5", "t4"]);
});

test("highlightParts marks each case-insensitive occurrence", () => {
  assert.deepEqual(highlightParts("Fix the fix", "FIX"), [
    { text: "Fix", match: true },
    { text: " the ", match: false },
    { text: "fix", match: true },
  ]);
  assert.deepEqual(highlightParts("abc", "  "), [{ text: "abc", match: false }]);
  assert.deepEqual(highlightParts("abc", "zz"), [{ text: "abc", match: false }]);
});
