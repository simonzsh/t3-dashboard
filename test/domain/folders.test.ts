import assert from "node:assert/strict";
import { test } from "bun:test";
import { expandHome, normalizeFolder } from "../../src/domain/folders.ts";

test("normalizeFolder expands the home folder and cleans the path", () => {
  const cases: Array<[string, string]> = [
    ["~", "/home/demo"],
    ["~/", "/home/demo"],
    ["~/src/", "/home/demo/src"],
    ["  ~/src//atlas ", "/home/demo/src/atlas"],
    ["/a/b/../c/", "/a/c"],
    ["/", "/"],
    ["/..", "/"],
  ];
  for (const [input, expected] of cases) assert.equal(normalizeFolder(input, "/home/demo"), expected, input);
});

test("expandHome keeps the trailing slash", () => {
  assert.equal(expandHome("~/src/", "/home/demo"), "/home/demo/src/");
  assert.equal(expandHome("~", "/home/demo"), "/home/demo");
  assert.equal(expandHome("/x/y", "/home/demo"), "/x/y");
  assert.equal(expandHome("~other/x", "/home/demo"), "~other/x");
});
