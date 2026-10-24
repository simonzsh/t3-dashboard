import assert from "node:assert/strict";
import { test } from "node:test";
import { linearFile, readLinearWorkspaces } from "../src/linearConfig.ts";

const files = (map: Record<string, string>) => (path: string) => {
  if (path in map) return map[path]!;
  throw Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
};

test("default path is under the user config directory, and the env variable overrides it", () => {
  assert.equal(linearFile({}, "/home/ann"), "/home/ann/.config/t3-dashboard/linear.json");
  assert.equal(linearFile({ T3_DASHBOARD_LINEAR_FILE: "/x/l.json" }, "/home/ann"), "/x/l.json");
});

test("reads workspaces with name, key and T3 project", () => {
  const json = JSON.stringify({ workspaces: [{ name: "Space 1", apiKey: "key-1", t3Project: "Project A" }] });
  assert.deepEqual(readLinearWorkspaces("/x/l.json", files({ "/x/l.json": json })), [{ name: "Space 1", apiKey: "key-1", t3Project: "Project A" }]);
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
