import { test } from "bun:test";
import assert from "node:assert/strict";
import { MAX_DIFF_LINES, fileSection, limitLines } from "../../../src/features/conversation/runDiff.ts";

const diff = [
  "diff --git a/src/a.ts b/src/a.ts",
  "index 111..222 100644",
  "--- a/src/a.ts",
  "+++ b/src/a.ts",
  "@@ -1,2 +1,2 @@",
  " keep",
  "-old",
  "+new",
  "diff --git a/img/logo b.png b/img/logo b.png",
  "index 333..444 100644",
  "Binary files a/img/logo b.png and b/img/logo b.png differ",
  "diff --git a/old.ts b/new.ts",
  "similarity index 90%",
  "rename from old.ts",
  "rename to new.ts",
  "@@ -1 +1 @@",
  "-x",
  "+y",
].join("\n");

test("fileSection returns the hunks of one file, without the git header lines", () => {
  assert.deepEqual(fileSection(diff, "src/a.ts"), ["@@ -1,2 +1,2 @@", " keep", "-old", "+new"]);
});

test("fileSection finds a renamed file by its new path and a path with spaces", () => {
  assert.deepEqual(fileSection(diff, "new.ts"), ["@@ -1 +1 @@", "-x", "+y"]);
  assert.deepEqual(fileSection(diff, "img/logo b.png"), ["index 333..444 100644", "Binary files a/img/logo b.png and b/img/logo b.png differ"]);
});

test("fileSection is null for a file the diff does not hold", () => {
  assert.equal(fileSection(diff, "src/missing.ts"), null);
  assert.equal(fileSection("", "src/a.ts"), null);
});

test("limitLines keeps the first lines and counts the rest", () => {
  const lines = Array.from({ length: MAX_DIFF_LINES + 7 }, (_, i) => `l${i}`);
  const { shown, hidden } = limitLines(lines);
  assert.equal(shown.length, MAX_DIFF_LINES);
  assert.equal(shown[0], "l0");
  assert.equal(hidden, 7);
  assert.deepEqual(limitLines(["a"]), { shown: ["a"], hidden: 0 });
});
