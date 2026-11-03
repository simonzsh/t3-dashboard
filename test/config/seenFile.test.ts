import assert from "node:assert/strict";
import { test } from "bun:test";
import { seenFile } from "../../src/config/paths.ts";
import { readSeen, seenText } from "../../src/config/seenFile.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/seen.json";

test("the seen file sits in the config directory", () => {
  assert.equal(seenFile({}, "/home/me"), "/home/me/.config/t3-dashboard/seen.json");
  assert.equal(seenFile({ T3_DASHBOARD_CONFIG_DIR: "/cfg" }, "/home/me"), "/cfg/seen.json");
});

test("a missing file, invalid JSON or a wrong shape gives null", () => {
  assert.equal(readSeen(FILE, files({})), null);
  assert.equal(readSeen(FILE, files({ [FILE]: "{oops" })), null);
  assert.equal(readSeen(FILE, files({ [FILE]: JSON.stringify({ seen: {} }) })), null);
});

test("what seenText writes reads back the same, pretty-printed with a final newline", () => {
  const state = { since: "2026-01-01T00:00:00Z", seen: { a: "2026-01-02T00:00:00Z" } };
  const text = seenText(state);
  assert.ok(text.endsWith("}\n") && text.includes("\n  "));
  assert.deepEqual(readSeen(FILE, files({ [FILE]: text })), state);
});
