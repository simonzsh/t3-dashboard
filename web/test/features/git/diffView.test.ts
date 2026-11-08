import assert from "node:assert/strict";
import { test } from "bun:test";
import type { DiffFile } from "../../../../shared/diff.ts";
import { isOpen, LARGE_FILE, openByDefault, setAll, setTests, toolbarOf } from "../../../src/features/git/diffView.ts";

const file = (path: string, additions: number, deletions = 0): DiffFile => ({ path, oldPath: path, newPath: path, status: "modified", binary: false, additions, deletions, hunks: [] });

test("a file over the large-file limit starts closed", () => {
  const open = openByDefault([file("big.ts", LARGE_FILE + 1), file("edge.ts", LARGE_FILE), file("small.ts", 3)]);
  assert.deepEqual([...open], ["edge.ts", "small.ts"]);
});

test("files stop opening once the diff passes the line budget", () => {
  const files = Array.from({ length: 10 }, (_, index) => file(`f${index}.ts`, 400));
  const open = openByDefault(files);
  assert.equal(open.size, 7); // 7 x 400 = 2800 fits in 3000, an eighth does not
  assert.ok(open.has("f6.ts") && !open.has("f7.ts"));
  // A closed file does not use the budget: a small file after it still opens.
  assert.ok(openByDefault([file("huge.ts", 5000), file("a.ts", 1)]).has("a.ts"));
});

test("additions and deletions both count", () => {
  assert.equal(openByDefault([file("a.ts", 300, 150)]).size, 0);
});

test("a choice of the user wins over the default", () => {
  const defaults = new Set(["a.ts"]);
  assert.equal(isOpen({}, defaults, "a.ts"), true);
  assert.equal(isOpen({ "a.ts": false }, defaults, "a.ts"), false);
  assert.equal(isOpen({ "b.ts": true }, defaults, "b.ts"), true);
});

test("Collapse all and Expand all set every file", () => {
  const files = [file("a.ts", 1), file("a.test.ts", 1)];
  assert.deepEqual(setAll(files, false), { "a.ts": false, "a.test.ts": false });
  assert.deepEqual(setAll(files, true), { "a.ts": true, "a.test.ts": true });
});

test("Collapse tests moves the test files only and keeps the other choices", () => {
  const files = [file("a.ts", 1), file("web/test/a.ts", 1), file("b.spec.ts", 1)];
  assert.deepEqual(setTests({ "a.ts": true }, files, false), { "a.ts": true, "web/test/a.ts": false, "b.spec.ts": false });
});

test("the toolbar offers Collapse while a file is open and shows the tests button only with tests", () => {
  const files = [file("a.ts", 1), file("a.test.ts", 1)];
  assert.deepEqual(toolbarOf(files, () => true), { hasTests: true, anyOpen: true, testsOpen: true });
  assert.deepEqual(toolbarOf(files, (path) => path === "a.ts"), { hasTests: true, anyOpen: true, testsOpen: false });
  assert.deepEqual(toolbarOf(files, () => false), { hasTests: true, anyOpen: false, testsOpen: false });
  assert.equal(toolbarOf([file("a.ts", 1)], () => true).hasTests, false);
});
