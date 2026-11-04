import assert from "node:assert/strict";
import { test } from "bun:test";
import { readAutomationThreads } from "../../src/config/automationThreads.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/automation-threads.json";

test("reads the thread ids and keeps strings only", () => {
  const read = files({ [FILE]: JSON.stringify({ threadIds: ["a", 3, null, "b"] }) });
  assert.deepEqual([...readAutomationThreads(FILE, read)], ["a", "b"]);
});

test("a missing file, invalid JSON or a wrong shape gives an empty set", () => {
  assert.equal(readAutomationThreads(FILE, files({})).size, 0);
  assert.equal(readAutomationThreads(FILE, files({ [FILE]: "{oops" })).size, 0);
  assert.equal(readAutomationThreads(FILE, files({ [FILE]: JSON.stringify({ threadIds: "a" }) })).size, 0);
  assert.equal(readAutomationThreads(FILE, files({ [FILE]: "null" })).size, 0);
});
