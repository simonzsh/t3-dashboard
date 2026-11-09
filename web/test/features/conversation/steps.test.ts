import { test } from "bun:test";
import assert from "node:assert/strict";
import type { TurnStep } from "../../../../shared/api.ts";
import { diffLines, groupLabel, omittedLabel, remember, stepDuration } from "../../../src/features/conversation/steps.ts";

const step = (startedAt: string, completedAt: string | null): TurnStep => ({ id: startedAt, runId: null, kind: "command", status: "done", startedAt, completedAt, text: "", detail: null, expandable: false, exitCode: null });

test("diffLines tells added, removed, hunk and context lines", () => {
  const diff = ["diff --git a/x b/x", "--- a/x", "+++ b/x", "@@ -1,3 +1,3 @@", " keep", "-old", "+new", "--- not a header", "\\ No newline at end of file"].join("\n");
  assert.deepEqual(diffLines(diff), [
    { type: "hunk", text: "diff --git a/x b/x" },
    { type: "hunk", text: "--- a/x" },
    { type: "hunk", text: "+++ b/x" },
    { type: "hunk", text: "@@ -1,3 +1,3 @@" },
    { type: "ctx", text: " keep" },
    { type: "del", text: "-old" },
    { type: "add", text: "+new" },
    { type: "del", text: "--- not a header" },
    { type: "ctx", text: "\\ No newline at end of file" },
  ]);
});

test("diffLines drops the final line break", () => {
  assert.deepEqual(diffLines("@@ -1 +1 @@\n+a\n"), [
    { type: "hunk", text: "@@ -1 +1 @@" },
    { type: "add", text: "+a" },
  ]);
});

test("diffLines reads the headers of a second file as headers", () => {
  const types = diffLines(["@@ -1 +1 @@", "-a", "diff --git a/y b/y", "--- a/y", "+++ b/y", "@@ -1 +1 @@", "+b"].join("\n")).map((l) => l.type);
  assert.deepEqual(types, ["hunk", "del", "hunk", "hunk", "hunk", "hunk", "add"]);
});

test("groupLabel counts steps and shows the time they took", () => {
  assert.equal(groupLabel([step("2026-01-01T10:00:00Z", "2026-01-01T10:00:05Z"), step("2026-01-01T10:00:05Z", "2026-01-01T10:00:12Z")]), "2 steps · 12s");
  assert.equal(groupLabel([step("2026-01-01T10:00:00Z", "2026-01-01T10:01:05Z")]), "1 step · 1m 05s");
});

test("groupLabel leaves the time out when a step has no time", () => {
  assert.equal(groupLabel([step("", null), step("", null)]), "2 steps");
  assert.equal(groupLabel([step("2026-01-01T10:00:00Z", null)]), "1 step");
});

test("step duration omits missing, invalid and reversed timestamps", () => {
  assert.equal(stepDuration(step("2026-01-01T10:00:00Z", "2026-01-01T10:00:03Z")), "3s");
  assert.equal(stepDuration(step("2026-01-01T10:00:00Z", "2026-01-01T10:00:00Z")), "<1s");
  assert.equal(stepDuration(step("2026-01-01T10:00:00Z", "2026-01-01T10:00:00.900Z")), "<1s");
  assert.equal(stepDuration(step("2026-01-01T10:00:00Z", null)), null);
  assert.equal(stepDuration(step("invalid", "2026-01-01T10:00:03Z")), null);
  assert.equal(stepDuration(step("2026-01-01T10:00:04Z", "2026-01-01T10:00:03Z")), null);
});

test("remember drops the oldest entry past the cap and keeps a rewritten key fresh", () => {
  const cache = new Map<string, number>();
  for (const [key, value] of [["a", 1], ["b", 2], ["a", 3], ["c", 4]] as const) remember(cache, key, value, 2);
  assert.deepEqual([...cache], [["a", 3], ["c", 4]]);
});

test("omittedLabel counts the steps left out", () => {
  assert.equal(omittedLabel(1), "1 earlier step not shown");
  assert.equal(omittedLabel(50), "50 earlier steps not shown");
});
