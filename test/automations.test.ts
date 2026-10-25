import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readAutomations } from "../src/automations.ts";

const now = new Date("2026-03-20T12:00:00.000Z");

interface Setup {
  jobs?: Record<string, string>;
  threads?: unknown;
  runs?: unknown;
  projectId?: string;
}

// Builds a config dir with one brain "alpha" whose workspace is <root>/ws-name/brain.
function build(setup: Setup) {
  const root = mkdtempSync(join(tmpdir(), "t3-dashboard-auto-"));
  const workspace = join(root, "ws-name", "brain");
  mkdirSync(join(workspace, "jobs"), { recursive: true });
  mkdirSync(join(workspace, "state"));
  for (const [file, content] of Object.entries(setup.jobs ?? {})) writeFileSync(join(workspace, "jobs", file), content);
  if (setup.threads !== undefined) writeFileSync(join(workspace, "state", "routine-threads.json"), JSON.stringify(setup.threads));
  if (setup.runs !== undefined) writeFileSync(join(workspace, "state", "runs.json"), JSON.stringify(setup.runs));
  const configDir = join(root, "config");
  mkdirSync(configDir);
  writeFileSync(join(configDir, "alpha.json"), JSON.stringify({ workspace, projectId: setup.projectId ?? "project-1", token: "secret-token-value" }));
  return { root, workspace, configDir };
}

const read = (configDir: string, titles: Record<string, string> = {}) => readAutomations({ configDir, now: () => now, projectTitle: (id) => titles[id] ?? null });

const routine = (extra = "") => `prompt: |\n  Check the inbox\n  and report\nschedule:\n  cron: "*/20 8-19 * * *"\n  timeZone: Europe/Paris\ntarget:\n  newThread: Inbox watch\n${extra}createdAt: 2026-03-01T00:00:00Z\n`;

test("a cron job becomes a routine with a French label, next run, thread and model", () => {
  const { configDir } = build({
    jobs: { "inbox.yaml": routine("engine:\n  model: model-x\n") },
    threads: { inbox: { threadId: "thread-1", engine: { model: "model-y" } } },
    runs: { inbox: "2026-03-20T11:40:00.000Z" },
  });
  const result = read(configDir, { "project-1": "Brain A" });
  assert.deepEqual(result.brains, [{ name: "Brain A", ok: true, error: null, problems: 0 }]);
  assert.equal(result.fetchedAt, now.toISOString());
  assert.deepEqual(result.automations, [
    {
      id: "inbox",
      brain: "Brain A",
      kind: "routine",
      title: "Inbox watch",
      schedule: { kind: "cron", cron: "*/20 8-19 * * *", timeZone: "Europe/Paris", label: "every 20 min, 08:00–19:00" },
      nextRunAt: "2026-03-20T12:20:00.000Z",
      lastRunAt: "2026-03-20T11:40:00.000Z",
      threadId: "thread-1",
      model: "model-x",
    },
  ]);
});

test("next run follows the time zone of the schedule", () => {
  const { configDir } = build({ jobs: { "daily.yaml": "prompt: Go\nschedule:\n  cron: 0 9 * * *\n  timeZone: America/New_York\n" } });
  // 09:00 in New York is 13:00 UTC in March after the US change to summer time.
  assert.equal(read(configDir).automations[0]?.nextRunAt, "2026-03-20T13:00:00.000Z");
});

test("the model falls back to the routine thread engine, then to null", () => {
  const { configDir } = build({
    jobs: { "a.yaml": routine(), "b.yaml": routine() },
    threads: { a: { threadId: "thread-1", engine: { model: "model-y" } } },
  });
  const byId = Object.fromEntries(read(configDir).automations.map((a) => [a.id, a]));
  assert.equal(byId.a?.model, "model-y");
  assert.equal(byId.b?.model, null);
  assert.equal(byId.b?.threadId, null);
  assert.equal(byId.b?.lastRunAt, null);
});

test("the title is the first prompt line cut at 80 characters when there is no newThread", () => {
  const long = "x".repeat(100);
  const { configDir } = build({
    jobs: { "a.yaml": `prompt: |\n  ${long}\n  second line\nschedule:\n  cron: "0 9 * * *"\n  timeZone: UTC\n` },
  });
  assert.equal(read(configDir).automations[0]?.title, "x".repeat(80));
});

test("an at job is a reminder with its target thread, and a reminder with no brain title uses the parent folder name", () => {
  const { configDir } = build({
    jobs: { "call.yaml": "prompt: Call back\nschedule:\n  at: 2026-03-21T09:00:00Z\ntarget:\n  thread: thread-7\n" },
    threads: { call: { threadId: "ignored" } },
  });
  const [item] = read(configDir).automations;
  assert.deepEqual(item, {
    id: "call",
    brain: "ws-name",
    kind: "reminder",
    title: "Call back",
    schedule: { kind: "once", at: "2026-03-21T09:00:00Z" },
    nextRunAt: "2026-03-21T09:00:00Z",
    lastRunAt: null,
    threadId: "thread-7",
    model: null,
  });
});

test("a reminder already run, or past by more than 24 hours, is removed", () => {
  const job = (at: string) => `prompt: R\nschedule:\n  at: ${at}\n`;
  const { configDir } = build({
    jobs: {
      "ran.yaml": job("2026-03-20T13:00:00Z"),
      "old.yaml": job("2026-03-19T11:59:00Z"),
      "recent.yaml": job("2026-03-19T12:01:00Z"),
      "dateonly.yaml": job("2026-03-22"),
      "later.yaml": job("2026-03-22T10:00:00Z"),
    },
    runs: { ran: "2026-03-20T11:00:00Z" },
  });
  assert.deepEqual(read(configDir).automations.map((a) => a.id), ["later", "recent"]);
});

test("unreadable, invalid or incomplete job files are ignored and counted", () => {
  const { configDir } = build({
    jobs: {
      "ok.yaml": routine(),
      "broken.yaml": "prompt: [unclosed",
      "nosched.yaml": "prompt: x\n",
      "badcron.yaml": "prompt: x\nschedule:\n  cron: nope\n  timeZone: UTC\n",
      "badzone.yaml": "prompt: x\nschedule:\n  cron: 0 9 * * *\n  timeZone: Mars/Base\n",
      "baddate.yaml": "prompt: x\nschedule:\n  at: soon\n",
      "readme.txt": "ignored, not a yaml file",
    },
  });
  const result = read(configDir);
  assert.deepEqual(result.automations.map((a) => a.id), ["ok"]);
  assert.equal(result.brains[0]?.problems, 5);
  assert.equal(result.brains[0]?.ok, true);
});

test("missing or broken state files do not hide the jobs", () => {
  const { configDir, workspace } = build({ jobs: { "a.yaml": routine() } });
  writeFileSync(join(workspace, "state", "runs.json"), "{not json");
  const result = read(configDir);
  assert.equal(result.automations.length, 1);
  assert.equal(result.automations[0]?.lastRunAt, null);
});

test("a brain without a jobs folder is ok with no automation", () => {
  const { configDir, workspace } = build({});
  rmSync(join(workspace, "jobs"), { recursive: true });
  const result = read(configDir);
  assert.deepEqual(result.brains, [{ name: "ws-name", ok: true, error: null, problems: 0 }]);
  assert.deepEqual(result.automations, []);
});

test("a brain with a missing workspace folder, or an unreadable config, is reported with ok false", () => {
  const { configDir, root } = build({});
  writeFileSync(join(configDir, "gone.json"), JSON.stringify({ workspace: join(root, "absent", "brain"), projectId: "p", token: "secret-token-value" }));
  writeFileSync(join(configDir, "broken.json"), "{secret-token-value");
  const brains = read(configDir).brains;
  const byName = Object.fromEntries(brains.map((b) => [b.name, b]));
  assert.equal(byName.absent?.ok, false);
  assert.equal(byName.broken?.ok, false);
  assert.equal(byName["ws-name"]?.ok, true);
  assert.ok(!JSON.stringify(brains).includes("secret-token-value"));
});

test("reading never writes: files and folders are unchanged, and the token never appears in the result", () => {
  const { configDir, workspace } = build({ jobs: { "a.yaml": routine() }, threads: { a: { threadId: "thread-1" } }, runs: { a: "2026-03-20T11:00:00Z" } });
  const snapshot = () =>
    [join(workspace, "jobs"), join(workspace, "state"), configDir].flatMap((dir) =>
      readdirSync(dir).map((name) => `${name}:${statSync(join(dir, name)).mtimeMs}:${readFileSync(join(dir, name), "utf8")}`),
    );
  const before = snapshot();
  const result = read(configDir);
  assert.deepEqual(snapshot(), before);
  assert.ok(!JSON.stringify(result).includes("secret-token-value"));
});
