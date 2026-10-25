import assert from "node:assert/strict";
import { test } from "bun:test";
import { readLinearFile, readLinearWorkspaces, toSimple, writeLinearConfig } from "../src/linearConfig.ts";

const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

test("reads workspaces with name and key", () => {
  const json = JSON.stringify({ workspaces: [{ name: "Space 1", apiKey: "key-1", t3Project: "Project A" }] });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })), [{ name: "Space 1", apiKey: "key-1" }]);
});

test("a single key gives one workspace named Linear, and teams and unlisted are ignored", () => {
  const json = JSON.stringify({ apiKey: " key-1 ", teams: { ENG: "Project A", OPS: null }, unlisted: "hide" });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })), [{ name: "Linear", apiKey: "key-1" }]);
});

test("a file without a key field gives no workspace", () => {
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": JSON.stringify({ teams: { ENG: "A" } }) })), []);
});

test("a missing file gives no workspace", () => {
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({})), []);
});

test("invalid JSON gives no workspace and no error text with the content", () => {
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": "{secret" })), []);
});

test("an empty or missing key is kept as an empty string", () => {
  const json = JSON.stringify({ workspaces: [{ name: "Space 1", apiKey: "" }, { name: "Space 2" }] });
  assert.deepEqual(
    readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })).map((w) => w.apiKey),
    ["", ""],
  );
});

test("entries without a name are skipped", () => {
  const json = JSON.stringify({ workspaces: [{ apiKey: "k" }, "nope", { name: "Space 1", apiKey: "k" }] });
  assert.deepEqual(
    readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })).map((w) => w.name),
    ["Space 1"],
  );
});

test("only the workspaces list counts as legacy", () => {
  const read = (root: unknown) => readLinearFile("/x/l.json", files({ "/x/l.json": JSON.stringify(root) })).legacy;
  assert.equal(read({ workspaces: [{ name: "S", apiKey: "k" }] }), true);
  assert.equal(read({ apiKey: "k" }), false);
  assert.equal(readLinearFile("/x/none.json", files({})).legacy, false);
});

test("toSimple keeps the first non-empty key, and an empty key for nothing", () => {
  const json = JSON.stringify({ workspaces: [{ name: "A", apiKey: "" }, { name: "B", apiKey: "key-b" }, { name: "C", apiKey: "key-c" }] });
  assert.deepEqual(toSimple(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json }))), { apiKey: "key-b" });
  assert.deepEqual(toSimple([]), { apiKey: "" });
});

test("writeLinearConfig writes the key only, ready to be read back", () => {
  const written: Record<string, string> = {};
  writeLinearConfig("/x/l.json", { apiKey: "k" }, (file, content) => {
    written[file] = content;
  });
  assert.deepEqual(JSON.parse(written["/x/l.json"]!), { apiKey: "k" });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files(written)), [{ name: "Linear", apiKey: "k" }]);
});
