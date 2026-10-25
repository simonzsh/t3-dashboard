import assert from "node:assert/strict";
import { test } from "bun:test";
import { readLinearFile, readLinearWorkspaces, toSimple, writeLinearConfig } from "../src/linearConfig.ts";

const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

test("reads workspaces with name, key and T3 project", () => {
  const json = JSON.stringify({ workspaces: [{ name: "Space 1", apiKey: "key-1", t3Project: "Project A" }] });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })), [{ name: "Space 1", apiKey: "key-1", t3Project: "Project A", teams: null, unlisted: "show" }]);
});

test("a single key with a team table gives one workspace named Linear", () => {
  const json = JSON.stringify({ apiKey: " key-1 ", teams: { ENG: "Project A", OPS: "Project B" } });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })), [
    { name: "Linear", apiKey: "key-1", t3Project: "", teams: { ENG: "Project A", OPS: "Project B" }, unlisted: "hide" },
  ]);
});

test("a legacy entry can also carry a team table, and bad team values are dropped", () => {
  const json = JSON.stringify({ workspaces: [{ name: "Space 1", apiKey: "k", t3Project: "Project A", teams: { ENG: "Project B", OPS: 3 } }, { name: "Space 2", apiKey: "k", teams: ["ENG"] }] });
  assert.deepEqual(
    readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })).map((w) => w.teams),
    [{ ENG: "Project B" }, null],
  );
});

test("the new format without a team table keeps all issues in no project", () => {
  const json = JSON.stringify({ apiKey: "key-1" });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })), [{ name: "Linear", apiKey: "key-1", t3Project: "", teams: null, unlisted: "show" }]);
});

test("a missing file gives no workspace", () => {
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({})), []);
});

test("invalid JSON gives no workspace and no error text with the content", () => {
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": "{secret" })), []);
});

test("an empty or missing key is kept as an empty string", () => {
  const json = JSON.stringify({ workspaces: [{ name: "Space 1", apiKey: "", t3Project: "p" }, { name: "Space 2", t3Project: "p" }] });
  assert.deepEqual(
    readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })).map((w) => w.apiKey),
    ["", ""],
  );
});

test("entries without a name are skipped", () => {
  const json = JSON.stringify({ workspaces: [{ apiKey: "k", t3Project: "p" }, "nope", { name: "Space 1", apiKey: "k", t3Project: "p" }] });
  assert.deepEqual(
    readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })).map((w) => w.name),
    ["Space 1"],
  );
});

test("null team values mean hidden and are kept", () => {
  const json = JSON.stringify({ apiKey: "k", teams: { ENG: "Project A", OPS: null, DES: "" } });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json }))[0]!.teams, { ENG: "Project A", OPS: null, DES: "" });
});

test("unlisted defaults to hide with a table and show without one, and an explicit value wins", () => {
  const read = (root: unknown) => readLinearWorkspaces("/x/l.json", files({ "/x/l.json": JSON.stringify(root) }))[0]!.unlisted;
  assert.equal(read({ apiKey: "k", teams: { ENG: "A" } }), "hide");
  assert.equal(read({ apiKey: "k" }), "show");
  assert.equal(read({ apiKey: "k", teams: { ENG: "A" }, unlisted: "show" }), "show");
  assert.equal(read({ apiKey: "k", teams: {}, unlisted: "hide" }), "hide");
  assert.equal(read({ apiKey: "k", teams: { ENG: "A" }, unlisted: "maybe" }), "hide");
});

test("only the workspaces list counts as legacy", () => {
  const read = (root: unknown) => readLinearFile("/x/l.json", files({ "/x/l.json": JSON.stringify(root) })).legacy;
  assert.equal(read({ workspaces: [{ name: "S", apiKey: "k" }] }), true);
  assert.equal(read({ apiKey: "k" }), false);
  assert.equal(readLinearFile("/x/none.json", files({})).legacy, false);
});

test("toSimple keeps the first workspace with a key and its table", () => {
  const json = JSON.stringify({
    workspaces: [
      { name: "A", apiKey: "", teams: { X: "p" } },
      { name: "B", apiKey: "key-b", teams: { ENG: "Project A", OPS: null } },
      { name: "C", apiKey: "key-c" },
    ],
  });
  assert.deepEqual(toSimple(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json }))), { apiKey: "key-b", teams: { ENG: "Project A", OPS: null }, unlisted: "hide" });
});

test("toSimple shows unlisted teams when the workspace had no table, and has defaults for nothing", () => {
  const json = JSON.stringify({ workspaces: [{ name: "A", apiKey: "k", t3Project: "p" }] });
  assert.deepEqual(toSimple(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json }))), { apiKey: "k", teams: {}, unlisted: "show" });
  assert.deepEqual(toSimple([]), { apiKey: "", teams: {}, unlisted: "show" });
});

test("writeLinearConfig writes exactly the simple format, ready to be read back", () => {
  const written: Record<string, string> = {};
  writeLinearConfig("/x/l.json", { apiKey: "k", teams: { ENG: "A", OPS: null }, unlisted: "hide" }, (file, content) => {
    written[file] = content;
  });
  assert.deepEqual(JSON.parse(written["/x/l.json"]!), { apiKey: "k", teams: { ENG: "A", OPS: null }, unlisted: "hide" });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files(written)), [{ name: "Linear", apiKey: "k", t3Project: "", teams: { ENG: "A", OPS: null }, unlisted: "hide" }]);
});
