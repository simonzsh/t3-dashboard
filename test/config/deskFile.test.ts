import assert from "node:assert/strict";
import { test } from "bun:test";
import { deskText, readDesk } from "../../src/config/deskFile.ts";
import { deskFile } from "../../src/config/paths.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/desk.json";

test("the desk file sits in the config directory", () => {
  assert.equal(deskFile({}, "/home/me"), "/home/me/.config/t3-dashboard/desk.json");
  assert.equal(deskFile({ T3_DASHBOARD_CONFIG_DIR: "/cfg" }, "/home/me"), "/cfg/desk.json");
});

test("reads the windows and the history, and drops what is not valid", () => {
  const raw = JSON.stringify({ windows: [{ id: "a", minimized: true }, { id: "a" }, { id: 2 }, { id: "b" }], history: ["b", 3, "b", "a"] });
  assert.deepEqual(readDesk(FILE, files({ [FILE]: raw })), { windows: [{ id: "a", minimized: true }, { id: "b", minimized: false }], history: ["b", "a"] });
});

test("a missing file, invalid JSON or a wrong shape gives null", () => {
  assert.equal(readDesk(FILE, files({})), null);
  assert.equal(readDesk(FILE, files({ [FILE]: "{oops" })), null);
  assert.equal(readDesk(FILE, files({ [FILE]: "null" })), null);
  assert.equal(readDesk(FILE, files({ [FILE]: JSON.stringify({ windows: [] }) })), null);
});

test("what deskText writes reads back the same, pretty-printed with a final newline", () => {
  const desk = { windows: [{ id: "a", minimized: false }], history: ["a"] };
  const text = deskText(desk);
  assert.ok(text.endsWith("}\n"));
  assert.ok(text.includes("\n  "));
  assert.deepEqual(readDesk(FILE, files({ [FILE]: text })), desk);
});
