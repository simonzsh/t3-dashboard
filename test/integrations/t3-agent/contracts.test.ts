import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { checkAgentFiles } from "../../../src/integrations/t3-agent/contracts.ts";

test("without configs the system is skipped", async () => {
  assert.equal((await checkAgentFiles(join(tmpdir(), "t3-dashboard-no-such-dir"))).skipped, "no t3-agent config found");
});

test("wrong configs, jobs and state entries are named by position, never by name, path or value", async () => {
  const dir = mkdtempSync(join(tmpdir(), "t3-dashboard-contracts-"));
  const workspace = join(dir, "secret-brain");
  mkdirSync(join(workspace, "jobs"), { recursive: true });
  mkdirSync(join(workspace, "state"));
  writeFileSync(join(dir, "secret-name.json"), JSON.stringify({ workspace, token: "secret-token" }));
  writeFileSync(join(dir, "zz-broken.json"), JSON.stringify({ token: "secret-token" }));
  writeFileSync(join(workspace, "jobs", "secret-job.yaml"), "prompt: secret prompt\nschedule:\n  cron: 5\n");
  writeFileSync(join(workspace, "jobs", "zz-bad.yaml"), "a: [");
  writeFileSync(join(workspace, "state", "routine-threads.json"), JSON.stringify({ "secret-job": { threadId: 42 } }));
  const report = await checkAgentFiles(dir);
  assert.deepEqual(report.findings, [
    { level: "breaking", text: "brain[0] job[0]: schedule.cron should be string, got number" },
    { level: "breaking", text: "brain[0] job[1]: unreadable YAML" },
    { level: "breaking", text: "brain[0] state threads entry: threadId should be string, got number" },
    { level: "breaking", text: "brain[1] config: Missing workspace field" },
  ]);
  assert.ok(!JSON.stringify(report).includes("secret"));
});
