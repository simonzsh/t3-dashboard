import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { agentConfigDir, loadBrains, readWorkspace } from "../../../src/integrations/t3-agent/files.ts";

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

function workspace(files: Record<string, string>): string {
  const dir = tempDir();
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, ".."), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

test("readWorkspace returns null when the brain folder does not exist", () => {
  assert.equal(readWorkspace(join(tempDir(), "absent")), null);
});

test("readWorkspace reads the YAML jobs in name order and marks a broken or wrongly typed one", () => {
  const dir = workspace({
    "jobs/b.yaml": "prompt: Hello\nschedule:\n  cron: '0 9 * * *'\ntarget:\n  newThread: Daily\nengine:\n  model: m1\n",
    "jobs/a.yaml": "schedule: [oops",
    "jobs/c.yaml": "schedule:\n  cron: 5\n",
    "jobs/notes.txt": "ignored",
  });
  const result = readWorkspace(dir)!;
  assert.deepEqual(result.jobs, [
    { id: "a", job: null },
    { id: "b", job: { prompt: "Hello", schedule: { cron: "0 9 * * *" }, target: { newThread: "Daily" }, engine: { model: "m1" } } },
    { id: "c", job: null },
  ]);
});

test("readWorkspace keeps the valid state entries and drops the others", () => {
  const dir = workspace({
    "state/routine-threads.json": JSON.stringify({ a: { threadId: "t1", engine: { model: "m" } }, b: { threadId: 4 }, c: "x" }),
    "state/runs.json": JSON.stringify({ a: "2026-03-20T11:40:00.000Z", b: 12 }),
  });
  const result = readWorkspace(dir)!;
  assert.deepEqual(result.jobs, []);
  assert.deepEqual(result.threads, { a: { threadId: "t1", engine: { model: "m" } } });
  assert.deepEqual(result.runs, { a: "2026-03-20T11:40:00.000Z" });
});

test("missing or broken state files give empty state", () => {
  const result = readWorkspace(workspace({ "state/runs.json": "{oops", "state/routine-threads.json": "[1]" }))!;
  assert.deepEqual([result.threads, result.runs], [{}, {}]);
});
