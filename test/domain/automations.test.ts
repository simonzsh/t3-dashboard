import assert from "node:assert/strict";
import { test } from "bun:test";
import type { AutomationRequestBody } from "../../shared/api.ts";
import { automationPrompt, createAutomations, toAutomations } from "../../src/domain/automations.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { RawScheduledTask, RawThread } from "../../src/integrations/t3/schemas.ts";
import { FakePort } from "../helpers/fakePort.ts";

const task = (extra: Partial<RawScheduledTask> = {}): RawScheduledTask => ({
  id: "task-1",
  title: "Inbox triage",
  prompt: "Triage",
  enabled: true,
  schedule: { type: "interval", everyMs: 900_000 },
  projectId: "project-1",
  threadId: null,
  createdAt: "2026-03-20T09:00:00.000Z",
  creationSource: "mcp",
  ...extra,
});

const thread = (id: string, extra: Partial<RawThread> = {}): RawThread => ({ id, projectId: "project-1", title: "Inbox triage", creationSource: "mcp", createdAt: "2026-03-20T10:00:00.000Z", ...extra });

const titles: Record<string, string> = { "project-1": "Project A" };
const convert = (tasks: RawScheduledTask[], threads: RawThread[] = [], dedicated: string[] = []) => toAutomations(tasks, threads, new Set(dedicated), (id) => titles[id] ?? null);

test("a task becomes a routine with its project, schedule label, state and model", () => {
  const [routine] = convert([task({ modelSelection: { instanceId: "claudeAgent", model: "model-x" }, nextRunAt: "2026-03-21T08:00:00.000Z", lastRunAt: "2026-03-20T12:00:00.000Z", lastRunStatus: "succeeded" })]).automations;
  assert.deepEqual(routine, {
    id: "task-1",
    kind: "routine",
    title: "Inbox triage",
    projectId: "project-1",
    project: "Project A",
    scheduleLabel: "Every 15 min",
    enabled: true,
    nextRunAt: "2026-03-21T08:00:00.000Z",
    lastRunAt: "2026-03-20T12:00:00.000Z",
    lastRunStatus: "succeeded",
    lastRunError: null,
    threadId: null,
    model: "model-x",
  });
});

test("a Reminder or Rappel prefix makes a reminder and leaves the title", () => {
  const items = convert([task({ id: "a", title: "Reminder: Call Sam" }), task({ id: "b", title: "  rappel : Appeler Sam" }), task({ id: "c", title: "Reminders digest" })]).automations;
  assert.deepEqual(items.map((item) => [item.kind, item.title]), [["reminder", "Call Sam"], ["reminder", "Appeler Sam"], ["routine", "Reminders digest"]]);
});

test("an unknown project is No project, a webhook is a routine labelled Webhook", () => {
  const [item] = convert([task({ projectId: "gone", schedule: { type: "webhook" } })]).automations;
  assert.equal(item!.project, "No project");
  assert.equal(item!.scheduleLabel, "Webhook");
  assert.equal(item!.kind, "routine");
  assert.equal(convert([task({ projectId: null })]).automations[0]!.project, "No project");
});

test("run status maps to running, succeeded or failed; never and unknown give null", () => {
  const status = (lastRunStatus: string | undefined) => convert([task({ lastRunStatus })]).automations[0]!.lastRunStatus;
  assert.deepEqual(["running", "succeeded", "failed", "never", "weird", undefined].map(status), ["running", "succeeded", "failed", null, null, null]);
  assert.equal(convert([task({ lastRunStatus: "failed", lastRunError: "Boom" })]).automations[0]!.lastRunError, "Boom");
});

test("setupThreadIds lists the dedicated threads that no task is bound to", () => {
  assert.deepEqual(convert([], [], ["t-a", "t-b"]).setupThreadIds, ["t-a", "t-b"]);
  assert.deepEqual(convert([task({ threadId: "t-a" })], [], ["t-a", "t-b"]).setupThreadIds, ["t-b"]);
  assert.deepEqual(convert([task({ threadId: "t-chat" })], [], []).setupThreadIds, []);
});

test("a dedicated thread is hidden only while a task is bound to it", () => {
  const bound = convert([task({ threadId: "t-dedicated" })], [], ["t-dedicated"]);
  assert.deepEqual(bound.hiddenThreadIds, ["t-dedicated"]);
  assert.equal(bound.automations[0]!.threadId, "t-dedicated");
  assert.deepEqual(convert([], [], ["t-dedicated"]).hiddenThreadIds, []);
  assert.deepEqual(convert([task({ threadId: "t-other" })], [], ["t-dedicated"]).hiddenThreadIds, []);
});

test("a normal conversation bound to a task stays visible", () => {
  const result = convert([task({ threadId: "t-chat" })], [thread("t-chat")]);
  assert.deepEqual(result.hiddenThreadIds, []);
  assert.equal(result.automations[0]!.threadId, "t-chat");
});

test("run threads of an unbound task are hidden and the newest is the row thread", () => {
  const threads = [
    thread("run-old", { createdAt: "2026-03-20T10:00:00.000Z" }),
    thread("run-new", { createdAt: "2026-03-20T12:00:00.000Z" }),
    thread("before", { createdAt: "2026-03-19T10:00:00.000Z" }),
    thread("other-title", { title: "Something else" }),
    thread("other-project", { projectId: "project-2" }),
    thread("by-user", { creationSource: "server" }),
  ];
  const result = convert([task()], threads);
  assert.deepEqual(result.hiddenThreadIds.sort(), ["run-new", "run-old"]);
  assert.equal(result.automations[0]!.threadId, "run-new");
});

test("a bound task never matches run threads", () => {
  const result = convert([task({ threadId: "t-chat" })], [thread("t-chat"), thread("lookalike")]);
  assert.deepEqual(result.hiddenThreadIds, []);
});

test("automationPrompt carries the trimmed request and the reminder rules", () => {
  const prompt = automationPrompt("  Remind me at 5pm  ");
  assert.match(prompt, /schedule_task/);
  assert.match(prompt, /bindToCurrentThread: true/);
  assert.match(prompt, /"Reminder: "/);
  assert.match(prompt, /interval, with everyMs/);
  assert.match(prompt, /\n\nRemind me at 5pm\n\n/);
});

test("remove deletes the task through the port", async () => {
  const { automations, port } = harness();
  await automations.remove("task-1");
  assert.deepEqual(port.deletedTasks, ["task-1"]);
});

test("remove wraps a port failure as an IntegrationError", async () => {
  const { automations, port } = harness();
  port.deleteError = new Error("socket closed");
  await assert.rejects(automations.remove("task-1"), (error) => error instanceof IntegrationError && error.kind === "unreachable");
  port.deleteError = new IntegrationError("refused", { system: "t3", kind: "refused" });
  await assert.rejects(automations.remove("task-1"), (error) => error instanceof IntegrationError && error.kind === "refused");
});

function harness(overrides: { dedicatedAdd?: (id: string) => void } = {}) {
  const port = new FakePort();
  const created: Array<{ create: unknown; images: unknown }> = [];
  const added: string[] = [];
  const warnings: string[] = [];
  const automations = createAutomations({
    port,
    store: { project: (id) => (id === "project-1" ? { id, title: "Project A", defaultModelSelection: null, icon: null } : undefined), rawThreads: () => [thread("run-1")] },
    dedicated: { read: () => new Set(["t-dedicated"]), add: overrides.dedicatedAdd ?? ((id) => void added.push(id)) },
    createThread: async (create, images) => {
      created.push({ create, images });
      return "new-thread";
    },
    warn: (message) => warnings.push(message),
    newId: () => "id-1",
  });
  return { automations, port, created, added, warnings };
}

const body = (extra: Partial<AutomationRequestBody> = {}): AutomationRequestBody => ({ text: "  Remind me at 5pm\nabout the launch ", projectId: "project-1", modelSelection: { instanceId: "claudeAgent", model: "m" }, runtimeMode: "full-access", ...extra });

test("request creates a thread with the instruction, records it and returns its id", async () => {
  const { automations, created, added } = harness();
  assert.equal(await automations.request(body()), "new-thread");
  assert.deepEqual(created, [
    {
      create: { projectId: "project-1", title: "Remind me at 5pm", text: automationPrompt("Remind me at 5pm\nabout the launch"), modelSelection: { instanceId: "claudeAgent", model: "m" }, runtimeMode: "full-access" },
      images: [],
    },
  ]);
  assert.deepEqual(added, ["new-thread"]);
});

test("request cuts a long first line to a 60-character title", async () => {
  const { automations, created } = harness();
  await automations.request(body({ text: "x".repeat(100) }));
  assert.equal((created[0]!.create as { title: string }).title.length, 60);
});

test("request keeps an empty project id so T3's No project is used", async () => {
  const { automations, created } = harness();
  await automations.request(body({ projectId: "" }));
  assert.equal((created[0]!.create as { projectId: string }).projectId, "");
});

test("request rejects an empty text", async () => {
  const { automations, created } = harness();
  await assert.rejects(automations.request(body({ text: "  \n " })), (error) => error instanceof DomainError && error.code === "invalid");
  assert.equal(created.length, 0);
});

test("request still succeeds when the state file cannot be written", async () => {
  const { automations, warnings } = harness({
    dedicatedAdd: () => {
      throw new Error("disk full");
    },
  });
  assert.equal(await automations.request(body()), "new-thread");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0]!, /disk full/);
});

test("list converts the tasks of T3 with the live threads and the dedicated set", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ threadId: "t-dedicated" }), task({ id: "task-2", threadId: null })];
  const result = await automations.list();
  assert.deepEqual(result.automations.map((item) => [item.id, item.threadId]), [["task-1", "t-dedicated"], ["task-2", "run-1"]]);
  assert.deepEqual(result.hiddenThreadIds.sort(), ["run-1", "t-dedicated"]);
});

test("list turns a plain port error into a T3 error and keeps an integration error", async () => {
  const { automations, port } = harness();
  port.scheduledTasksError = new Error("socket closed");
  await assert.rejects(automations.list(), (error) => error instanceof IntegrationError && error.system === "t3" && error.kind === "unreachable");
  const original = new IntegrationError("old T3", { system: "t3", kind: "protocol" });
  port.scheduledTasksError = original;
  await assert.rejects(automations.list(), (error) => error === original);
});

test("rename sets the title of an unbound task and sends no thread command", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task()];
  await automations.rename("task-1", "  Daily triage ");
  assert.deepEqual(port.renamedTasks, [{ id: "task-1", title: "Daily triage" }]);
  assert.deepEqual(port.commands, []);
});

test("rename keeps the reminder prefix of the T3 title", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ title: "Rappel : Appeler Paul" }), task({ id: "task-2", title: "Reminder: Call" })];
  await automations.rename("task-1", "Appeler Marie");
  await automations.rename("task-2", "Call Anna");
  assert.deepEqual(port.renamedTasks, [{ id: "task-1", title: "Rappel : Appeler Marie" }, { id: "task-2", title: "Reminder: Call Anna" }]);
});

test("rename also renames the bound thread with a stamped command", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ threadId: "t-dedicated" })];
  await automations.rename("task-1", "Daily triage");
  assert.deepEqual(port.commands, [{ type: "thread.metadata.update", threadId: "t-dedicated", title: "Daily triage", commandId: "id-1" }]);
});

test("rename refuses a webhook task, an unknown task and an empty title", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ schedule: { type: "webhook" } })];
  const code = (id: string, title: string) => automations.rename(id, title).then(() => null, (error: DomainError) => error.code);
  assert.equal(await code("task-1", "x"), "conflict");
  assert.equal(await code("nope", "x"), "not-found");
  assert.equal(await code("task-1", "  "), "invalid");
  assert.deepEqual(port.renamedTasks, []);
  assert.deepEqual(port.commands, []);
});

test("rename keeps the thread as it is when T3 refuses the task rename", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ threadId: "t-dedicated" })];
  port.renameError = new IntegrationError("refused", { system: "t3", kind: "refused" });
  await assert.rejects(automations.rename("task-1", "x"), IntegrationError);
  assert.deepEqual(port.commands, []);
});
