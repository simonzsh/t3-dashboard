import assert from "node:assert/strict";
import { test } from "bun:test";
import { parseDiff } from "../../shared/diff.ts";

const MODIFIED = ["diff --git a/src/a.ts b/src/a.ts", "index 1..2 100644", "--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,3 +1,3 @@ function f()", " keep", "-old", "+new", " end", "\\ No newline at end of file", ""].join("\n");

test("parses a modified file with line numbers, counts and the hunk section", () => {
  const [file] = parseDiff(MODIFIED);
  assert.equal(file!.path, "src/a.ts");
  assert.equal(file!.status, "modified");
  assert.deepEqual([file!.additions, file!.deletions], [1, 1]);
  const hunk = file!.hunks[0]!;
  assert.equal(hunk.section, "function f()");
  assert.deepEqual(hunk.lines.map((line) => [line.kind, line.oldNo, line.newNo]), [["context", 1, 1], ["del", 2, undefined], ["add", undefined, 2], ["context", 3, 3]]);
  assert.equal(hunk.lines[3]!.noNewline, true);
});

test("reads added, deleted, renamed and binary files", () => {
  const text = [
    "diff --git a/new.ts b/new.ts", "new file mode 100644", "--- /dev/null", "+++ b/new.ts", "@@ -0,0 +1 @@", "+x",
    "diff --git a/gone.ts b/gone.ts", "deleted file mode 100644", "--- a/gone.ts", "+++ /dev/null", "@@ -1 +0,0 @@", "-y",
    "diff --git a/old.ts b/moved.ts", "similarity index 90%", "rename from old.ts", "rename to moved.ts",
    "diff --git a/logo.png b/logo.png", "index 1..2 100644", "Binary files a/logo.png and b/logo.png differ", "",
  ].join("\n");
  const files = parseDiff(text);
  assert.deepEqual(files.map((file) => [file.path, file.status, file.binary]), [["new.ts", "added", false], ["gone.ts", "deleted", false], ["moved.ts", "renamed", false], ["logo.png", "modified", true]]);
  assert.equal(files[2]!.oldPath, "old.ts");
  assert.equal(files[2]!.similarity, 90);
});

test("decodes a quoted path with UTF-8 octal escapes", () => {
  const text = ['diff --git "a/t\\303\\251st.ts" "b/t\\303\\251st.ts"', '--- "a/t\\303\\251st.ts"', '+++ "b/t\\303\\251st.ts"', "@@ -1 +1 @@", "-a", "+b", ""].join("\n");
  assert.equal(parseDiff(text)[0]!.path, "tést.ts");
});

test("a file over the line cap drops its hunks and keeps its counts", () => {
  const body = Array.from({ length: 10 }, (_, index) => `+line ${index}`);
  const text = ["diff --git a/big.ts b/big.ts", "new file mode 100644", "--- /dev/null", "+++ b/big.ts", "@@ -0,0 +1,10 @@", ...body, ""].join("\n");
  const [file] = parseDiff(text, { maxLinesPerFile: 5 });
  assert.equal(file!.truncated, true);
  assert.equal(file!.hunks.length, 0);
  assert.equal(file!.additions, 10);
});

test("never throws on garbage", () => {
  assert.deepEqual(parseDiff("not a diff\n@@ nonsense"), []);
  assert.deepEqual(parseDiff(""), []);
});
