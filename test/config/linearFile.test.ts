import assert from "node:assert/strict";
import { test } from "bun:test";
import { readLinearKey, writeLinearKey } from "../../src/config/linearFile.ts";
import { files } from "../helpers/files.ts";

const read = (root: unknown) => readLinearKey("/x/l.json", files({ "/x/l.json": JSON.stringify(root) }));

test("reads the key, trimmed, and ignores the other fields", () => {
  assert.equal(read({ apiKey: " key-1 ", teams: { ENG: "Project A", OPS: null }, unlisted: "hide" }), "key-1");
});

test("an old workspaces list gives its first non-empty key", () => {
  assert.equal(read({ workspaces: [{ name: "A", apiKey: "" }, { name: "B" }, "nope", { name: "C", apiKey: " key-c " }, { name: "D", apiKey: "key-d" }] }), "key-c");
  assert.equal(read({ workspaces: [{ name: "A", apiKey: "" }] }), "");
});

test("a missing file, invalid JSON or a file without a key gives no key", () => {
  assert.equal(readLinearKey("/x/l.json", files({})), "");
  assert.equal(readLinearKey("/x/l.json", files({ "/x/l.json": "{secret" })), "");
  assert.equal(read({ teams: { ENG: "A" } }), "");
  assert.equal(read(null), "");
  assert.equal(read({ apiKey: 3 }), "");
});

test("writeLinearKey writes the key only, ready to be read back", () => {
  const written: Record<string, string> = {};
  writeLinearKey("/x/l.json", "k", (file, content) => {
    written[file] = content;
  });
  assert.deepEqual(JSON.parse(written["/x/l.json"]!), { apiKey: "k" });
  assert.equal(readLinearKey("/x/l.json", files(written)), "k");
});
