import assert from "node:assert/strict";
import { test } from "bun:test";
import { stashFile } from "../../src/config/paths.ts";
import { readStash, stashText } from "../../src/config/stashFile.ts";
import type { StashEntry } from "../../shared/stash.ts";
import { files } from "../helpers/files.ts";

const FILE = "/x/stash.json";
const entry: StashEntry = { id: "a", text: "hi", uploads: [{ type: "file" as const, id: "u", name: "n.txt", mimeType: "text/plain", sizeBytes: 2 }], createdAt: "2026-11-04T10:00:00.000Z", threadId: "t", threadTitle: "T" };

test("the stash file sits in the config directory", () => {
  assert.equal(stashFile({}, "/home/me"), "/home/me/.config/t3-dashboard/stash.json");
  assert.equal(stashFile({ T3_DASHBOARD_CONFIG_DIR: "/cfg" }, "/home/me"), "/cfg/stash.json");
});

test("what stashText writes reads back the same, pretty-printed with a final newline", () => {
  const text = stashText([entry]);
  assert.ok(text.endsWith("}\n"));
  assert.deepEqual(readStash(FILE, files({ [FILE]: text })), [entry]);
});

test("a missing file, invalid JSON or a wrong shape gives an empty stash", () => {
  assert.deepEqual(readStash(FILE, files({})), []);
  assert.deepEqual(readStash(FILE, files({ [FILE]: "{oops" })), []);
  assert.deepEqual(readStash(FILE, files({ [FILE]: JSON.stringify({ entries: "a" }) })), []);
});

test("entries that are not valid, or repeat an id, are dropped", () => {
  const raw = JSON.stringify({ entries: [entry, { ...entry }, { ...entry, id: "b", createdAt: "never" }, { id: "c" }, { ...entry, id: "d", uploads: [{ id: 1 }] }] });
  assert.deepEqual(readStash(FILE, files({ [FILE]: raw })).map((e) => [e.id, e.uploads.length]), [["a", 1], ["d", 0]]);
});
