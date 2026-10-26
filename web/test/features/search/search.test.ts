import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ThreadSearchMatch } from "../../../../shared/api.ts";
import { mergeResults, moveSelection, shouldSearchContent, titleMatches } from "../../../src/features/search/search.ts";
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
