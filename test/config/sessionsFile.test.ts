import assert from "node:assert/strict";
import { test } from "bun:test";
import { sessionsFile } from "../../src/config/paths.ts";
import { readSessions, sessionsText } from "../../src/config/sessionsFile.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/sessions.json";
const read = (contents: Record<string, string>) => readSessions(FILE, files(contents));

test("the sessions file sits in the config directory", () => {
  assert.equal(sessionsFile({}, "/home/me"), "/home/me/.config/t3-dashboard/sessions.json");
  assert.equal(sessionsFile({ T3_DASHBOARD_CONFIG_DIR: "/cfg" }, "/home/me"), "/cfg/sessions.json");
});

test("reads the ids of the sessions, and drops what is not valid", () => {
  assert.deepEqual(read({ [FILE]: JSON.stringify({ ids: ["a", "a", 2, "b"] }) }), { ids: ["a", "b"] });
});

test("a missing file, invalid JSON or a wrong shape gives null", () => {
  assert.equal(read({}), null);
  assert.equal(read({ [FILE]: "{oops" }), null);
  assert.equal(read({ [FILE]: "null" }), null);
  assert.equal(read({ [FILE]: JSON.stringify({ ids: "a" }) }), null);
  assert.equal(read({ [FILE]: JSON.stringify({ windows: [{ id: "a" }] }) }), null);
});

test("what sessionsText writes reads back the same, pretty-printed with a final newline", () => {
  const sessions = { ids: ["a"] };
  const text = sessionsText(sessions);
  assert.ok(text.endsWith("}\n"));
  assert.ok(text.includes("\n  "));
  assert.deepEqual(read({ [FILE]: text }), sessions);
});
