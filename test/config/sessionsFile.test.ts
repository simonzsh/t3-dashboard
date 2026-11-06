import assert from "node:assert/strict";
import { test } from "bun:test";
import { legacyDeskFile, sessionsFile } from "../../src/config/paths.ts";
import { readSessions, sessionsText } from "../../src/config/sessionsFile.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/sessions.json";
const LEGACY = "/x/desk.json";
const read = (contents: Record<string, string>) => readSessions(FILE, LEGACY, files(contents));

test("the sessions file and the legacy desk file sit in the config directory", () => {
  assert.equal(sessionsFile({}, "/home/me"), "/home/me/.config/t3-dashboard/sessions.json");
  assert.equal(sessionsFile({ T3_DASHBOARD_CONFIG_DIR: "/cfg" }, "/home/me"), "/cfg/sessions.json");
  assert.equal(legacyDeskFile({}, "/home/me"), "/home/me/.config/t3-dashboard/desk.json");
  assert.equal(legacyDeskFile({ T3_DASHBOARD_CONFIG_DIR: "/cfg" }, "/home/me"), "/cfg/desk.json");
});

test("reads the ids of the sessions, and drops what is not valid", () => {
  assert.deepEqual(read({ [FILE]: JSON.stringify({ ids: ["a", "a", 2, "b"] }) }), { ids: ["a", "b"] });
});

test("a v0.5.7 file keeps only the ids of its windows", () => {
  const raw = JSON.stringify({ windows: [{ id: "a", minimized: true }, { id: "a" }, { id: 2 }, { id: "b" }], history: ["b", "a"] });
  assert.deepEqual(read({ [FILE]: raw }), { ids: ["a", "b"] });
});

test("a missing new file falls back to the legacy desk file", () => {
  assert.deepEqual(read({ [LEGACY]: JSON.stringify({ ids: ["old"] }) }), { ids: ["old"] });
});

test("the new file wins over the legacy one", () => {
  assert.deepEqual(read({ [FILE]: JSON.stringify({ ids: ["new"] }), [LEGACY]: JSON.stringify({ ids: ["old"] }) }), { ids: ["new"] });
});

test("a broken new file never falls back to the legacy one", () => {
  const legacy = { [LEGACY]: JSON.stringify({ ids: ["old"] }) };
  assert.equal(read({ [FILE]: "{oops", ...legacy }), null);
  assert.equal(read({ [FILE]: "null", ...legacy }), null);
  assert.equal(read({ [FILE]: JSON.stringify({ ids: "a" }), ...legacy }), null);
});

test("both files missing, or the legacy one broken, gives null", () => {
  assert.equal(read({}), null);
  assert.equal(read({ [LEGACY]: "{oops" }), null);
});

test("what sessionsText writes reads back the same, pretty-printed with a final newline", () => {
  const sessions = { ids: ["a"] };
  const text = sessionsText(sessions);
  assert.ok(text.endsWith("}\n"));
  assert.ok(text.includes("\n  "));
  assert.deepEqual(read({ [FILE]: text }), sessions);
});
