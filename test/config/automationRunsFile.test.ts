import assert from "node:assert/strict";
import { test } from "bun:test";
import { automationRunsText, readAutomationRuns } from "../../src/config/automationRunsFile.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/automation-runs.json";
const run = { threadId: "t1", startedAt: "2026-03-20T10:00:00.000Z", finishedAt: null, status: "running", error: null };

test("reads back what it wrote", () => {
  const log = { "task-1": [{ ...run, threadId: null, status: "failed" as const, error: "Boom" }] };
  assert.deepEqual(readAutomationRuns(FILE, files({ [FILE]: automationRunsText(log) })), log);
});

test("drops malformed runs and keeps the valid ones", () => {
  const text = JSON.stringify({ version: 1, tasks: { a: [run, { ...run, status: "weird" }, { ...run, startedAt: 3 }, "x", null], b: "nope" } });
  assert.deepEqual(readAutomationRuns(FILE, files({ [FILE]: text })), { a: [run] });
});

test("a missing file, invalid JSON or a wrong shape gives an empty log", () => {
  for (const read of [files({}), files({ [FILE]: "{oops" }), files({ [FILE]: "null" }), files({ [FILE]: "[]" }), files({ [FILE]: JSON.stringify({ version: 1 }) })]) assert.deepEqual(readAutomationRuns(FILE, read), {});
});
