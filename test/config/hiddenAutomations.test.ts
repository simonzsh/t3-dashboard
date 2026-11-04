import assert from "node:assert/strict";
import { test } from "bun:test";
import { hiddenAutomationsText, readHiddenAutomations } from "../../src/config/hiddenAutomations.ts";

test("readHiddenAutomations reads back what hiddenAutomationsText writes", () => {
  assert.deepEqual(readHiddenAutomations("f", () => hiddenAutomationsText(["task-1", "task-2"])), ["task-1", "task-2"]);
});

test("readHiddenAutomations keeps only string ids", () => {
  assert.deepEqual(readHiddenAutomations("f", () => JSON.stringify({ taskIds: ["task-1", 2, null] })), ["task-1"]);
});

test("a missing or broken file hides nothing", () => {
  assert.deepEqual(readHiddenAutomations("f", () => { throw new Error("ENOENT"); }), []);
  assert.deepEqual(readHiddenAutomations("f", () => "{"), []);
  assert.deepEqual(readHiddenAutomations("f", () => "null"), []);
});
