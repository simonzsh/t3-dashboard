import assert from "node:assert/strict";
import { test } from "bun:test";
import { addAutomationThread, readAutomationThreads } from "../../src/config/automationThreads.ts";
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

test("adding writes the whole list, pretty-printed with a final newline", () => {
  const written: Record<string, string> = {};
  addAutomationThread(FILE, "b", files({ [FILE]: JSON.stringify({ threadIds: ["a"] }) }), (file, text) => (written[file] = text));
  assert.equal(written[FILE], `{\n  "threadIds": [\n    "a",\n    "b"\n  ]\n}\n`);
});

test("adding an id already known writes nothing", () => {
  let writes = 0;
  addAutomationThread(FILE, "a", files({ [FILE]: JSON.stringify({ threadIds: ["a"] }) }), () => writes++);
  assert.equal(writes, 0);
});

test("adding to a missing file creates the list", () => {
  const written: Record<string, string> = {};
  addAutomationThread(FILE, "a", files({}), (file, text) => (written[file] = text));
  assert.deepEqual(JSON.parse(written[FILE]!), { threadIds: ["a"] });
});
