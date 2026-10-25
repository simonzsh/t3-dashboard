import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { agentConfigDir, loadBrains } from "../src/brains.ts";

const tempDir = () => mkdtempSync(join(tmpdir(), "t3-dashboard-brains-"));

test("default directory is under the user config, and the env variable overrides it", () => {
  assert.equal(agentConfigDir({}, "/home/ann"), "/home/ann/.config/t3-agent");
  assert.equal(agentConfigDir({ T3_DASHBOARD_AGENT_CONFIG_DIR: "/x/brains" }, "/home/ann"), "/x/brains");
});

test("reads workspace and projectId of each JSON file and never returns the token", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "alpha.json"), JSON.stringify({ workspace: "/w/alpha/brain", projectId: "project-1", token: "secret-token-value" }));
  writeFileSync(join(dir, "beta.json"), JSON.stringify({ workspace: "/w/beta/brain", projectId: "project-2" }));
  writeFileSync(join(dir, "notes.txt"), "ignored");
  const brains = loadBrains(dir);
  assert.deepEqual(brains, [
    { name: "alpha", workspace: "/w/alpha/brain", projectId: "project-1", error: null },
    { name: "beta", workspace: "/w/beta/brain", projectId: "project-2", error: null },
  ]);
  assert.ok(!JSON.stringify(brains).includes("secret-token-value"));
});

test("a broken file or one without a workspace gives an error without quoting the content", () => {
  const dir = tempDir();
  writeFileSync(join(dir, "broken.json"), "{secret-token-value");
  writeFileSync(join(dir, "empty.json"), JSON.stringify({ token: "secret-token-value" }));
  const brains = loadBrains(dir);
  assert.deepEqual(brains.map((b) => [b.name, b.workspace, b.error !== null]), [["broken", null, true], ["empty", null, true]]);
  assert.ok(!JSON.stringify(brains).includes("secret-token-value"));
});

test("a missing directory gives no brain", () => {
  assert.deepEqual(loadBrains(join(tempDir(), "absent")), []);
});

test("a directory entry named like a JSON file is skipped", () => {
  const dir = tempDir();
  mkdirSync(join(dir, "folder.json"));
  assert.deepEqual(loadBrains(dir), []);
});
