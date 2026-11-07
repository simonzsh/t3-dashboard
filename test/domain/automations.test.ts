import assert from "node:assert/strict";
import { test } from "bun:test";
import type { CreateAutomationBody, UpdateAutomationBody } from "../../shared/api.ts";
import { createAutomations, toAutomations } from "../../src/domain/automations.ts";
import { AutomationRunLog, type RunLog } from "../../src/domain/automationRuns.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { RearmedStore } from "../../src/domain/rearmedStore.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { RawProjection, RawScheduledTask, RawThread } from "../../src/integrations/t3/schemas.ts";
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
    modelSelection: { instanceId: "claudeAgent", model: "model-x" },
    prompt: "Triage",
    schedule: { type: "interval", everyMinutes: 15 },
    runtimeMode: null,
    bound: false,
    webhook: null,
    runs: [],
  });
});

test("a Reminder or Rappel prefix makes a reminder and leaves the title", () => {
  const items = convert([task({ id: "a", title: "Reminder: Call Sam" }), task({ id: "b", title: "  rappel : Appeler Sam" }), task({ id: "c", title: "Reminders digest" })]).automations;
  assert.deepEqual(items.map((item) => [item.kind, item.title]), [["reminder", "Call Sam"], ["reminder", "Appeler Sam"], ["routine", "Reminders digest"]]);
});

test("a prompt that pauses its own task makes a reminder, whatever the title", () => {
  const pause = (id: string) => `Do it.\n\nThen disable this scheduled task: call schedule_task with scheduledTaskId ${id} and enabled: false. Do not delete it.`;
  const items = convert([
    task({ id: "a", title: "Call Sam", prompt: pause("a") }),
    task({ id: "b", title: "List tasks", prompt: pause("other-task") }),
    task({ id: "c", title: "Hook", prompt: pause("c"), schedule: { type: "webhook" } }),
  ]).automations;
  assert.deepEqual(items.map((item) => [item.kind, item.title]), [["reminder", "Call Sam"], ["routine", "List tasks"], ["webhook", "Hook"]]);
});

test("an unknown project is No project", () => {
  assert.equal(convert([task({ projectId: "gone" })]).automations[0]!.project, "No project");
  assert.equal(convert([task({ projectId: null })]).automations[0]!.project, "No project");
});

test("a webhook task is a webhook, even with a Reminder prefix, and keeps its title", () => {
  const items = convert([task({ id: "a", title: "PR reviews", schedule: { type: "webhook" } }), task({ id: "b", title: "Reminder: hook", schedule: { type: "webhook" } })]).automations;
  assert.deepEqual(items.map((item) => [item.kind, item.title, item.scheduleLabel]), [["webhook", "PR reviews", "Webhook"], ["webhook", "Reminder: hook", "Webhook"]]);
});

test("a webhook carries its public URL and whether it is signed", () => {
  const hook = { type: "webhook" };
  const [signed, unsigned, missing, unsignedFlag] = convert([
    task({ id: "a", schedule: hook, webhook: { url: "https://relay.example.invalid/v1/hooks/k/a/tok", hasSecret: true } }),
    task({ id: "b", schedule: hook, webhook: { url: null, hasSecret: false } }),
    task({ id: "c", schedule: hook }),
    task({ id: "d", schedule: hook, webhook: { url: "https://relay.example.invalid/v1/hooks/k/d/tok" } }),
  ]).automations;
  assert.deepEqual(signed!.webhook, { url: "https://relay.example.invalid/v1/hooks/k/a/tok", signed: true, filters: [], signature: null });
  assert.deepEqual(unsigned!.webhook, { url: null, signed: false, filters: [], signature: null });
  assert.deepEqual(missing!.webhook, { url: null, signed: false, filters: [], signature: null });
  assert.deepEqual(unsignedFlag!.webhook, { url: "https://relay.example.invalid/v1/hooks/k/d/tok", signed: false, filters: [], signature: null });
});

test("a task that is not a webhook has no webhook field, whatever T3 sends", () => {
  const [item] = convert([task({ webhook: { url: "https://relay.example.invalid/x", hasSecret: true } })]).automations;
  assert.equal(item!.kind, "routine");
  assert.equal(item!.webhook, null);
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

test("a dedicated thread is marked only while a task is bound to it, and a setup thread is marked too", () => {
  const bound = convert([task({ threadId: "t-dedicated" })], [], ["t-dedicated"]);
  assert.deepEqual(bound.automationThreadIds, ["t-dedicated"]);
  assert.equal(bound.automations[0]!.threadId, "t-dedicated");
  assert.deepEqual(convert([], [], ["t-dedicated"]).automationThreadIds, ["t-dedicated"]);
  assert.deepEqual(convert([task({ threadId: "t-other" })], [], ["t-dedicated"]).automationThreadIds, ["t-dedicated"]);
});

test("a normal conversation bound to a task is not marked", () => {
  const result = convert([task({ threadId: "t-chat" })], [thread("t-chat")]);
  assert.deepEqual(result.automationThreadIds, []);
  assert.equal(result.automations[0]!.threadId, "t-chat");
});

test("run threads of an unbound task are marked and the newest is the row thread", () => {
  const threads = [
    thread("run-old", { createdAt: "2026-03-20T10:00:00.000Z" }),
    thread("run-new", { createdAt: "2026-03-20T12:00:00.000Z" }),
    thread("before", { createdAt: "2026-03-19T10:00:00.000Z" }),
    thread("other-title", { title: "Something else" }),
    thread("other-project", { projectId: "project-2" }),
    thread("by-user", { creationSource: "server" }),
  ];
  const result = convert([task()], threads);
  assert.deepEqual(result.automationThreadIds.sort(), ["run-new", "run-old"]);
  assert.equal(result.automations[0]!.threadId, "run-new");
});

test("webhook event threads are marked like any run thread and the newest is the row thread", () => {
  const threads = [thread("event-1", { createdAt: "2026-03-20T10:00:00.000Z" }), thread("event-2", { createdAt: "2026-03-20T12:00:00.000Z" })];
  const result = convert([task({ schedule: { type: "webhook" } })], threads);
  assert.deepEqual(result.automationThreadIds.sort(), ["event-1", "event-2"]);
  assert.equal(result.automations[0]!.threadId, "event-2");
});

test("a bound task never matches run threads", () => {
  const result = convert([task({ threadId: "t-chat" })], [thread("t-chat"), thread("lookalike")]);
  assert.deepEqual(result.automationThreadIds, []);
});

test("an automation carries the runs logged for its task", () => {
  const run = { threadId: "run-1", startedAt: "2026-03-20T10:00:00.000Z", finishedAt: null, status: "running" as const, error: null };
  const result = toAutomations([task(), task({ id: "task-2" })], [], new Set(), () => null, { "task-1": [run] });
  assert.deepEqual(result.automations.map((item) => item.runs), [[run], []]);
});

test("remove deletes the task through the port", async () => {
  const { automations, port } = harness();
  await automations.remove("task-1");
  assert.deepEqual(port.deletedTasks, ["task-1"]);
});

const REMINDER = "Reminder: Call back";
const archived = (port: FakePort) => port.commands.filter((c) => c.type === "thread.archive").map((c) => c.threadId);

test("remove archives the run threads of a reminder after the delete", async () => {
  const runs = [thread("run-1", { title: REMINDER }), thread("run-2", { title: REMINDER }), thread("done", { title: REMINDER, archivedAt: "2026-04-01T00:00:00.000Z" }), thread("other")];
  const { automations, port } = harness(runs);
  port.scheduledTasks = [task({ title: REMINDER, enabled: false })];
  await automations.remove("task-1");
  assert.deepEqual(port.deletedTasks, ["task-1"]);
  assert.deepEqual(archived(port).sort(), ["run-1", "run-2"]);
});

test("remove keeps the threads of a routine, a webhook and a bound reminder", async () => {
  for (const kept of [task(), task({ title: REMINDER, schedule: { type: "webhook" } }), task({ title: REMINDER, threadId: "chat" })]) {
    const { automations, port } = harness([thread("run-1", { title: kept.title }), thread("chat", { title: kept.title })]);
    port.scheduledTasks = [kept];
    await automations.remove("task-1");
    assert.deepEqual(port.deletedTasks, ["task-1"]);
    assert.deepEqual(archived(port), [], JSON.stringify(kept));
  }
});

test("a failed archive does not fail the delete", async () => {
  const { automations, port, warnings } = harness([thread("run-1", { title: REMINDER })]);
  port.scheduledTasks = [task({ title: REMINDER })];
  port.dispatchError = new Error("refused");
  await automations.remove("task-1");
  assert.deepEqual(port.deletedTasks, ["task-1"]);
  assert.equal(warnings.length, 1);
});

test("a failed delete archives nothing", async () => {
  const { automations, port } = harness([thread("run-1", { title: REMINDER })]);
  port.scheduledTasks = [task({ title: REMINDER })];
  port.deleteError = new Error("socket closed");
  await assert.rejects(automations.remove("task-1"));
  assert.deepEqual(archived(port), []);
});

test("remove wraps a port failure as an IntegrationError", async () => {
  const { automations, port } = harness();
  port.deleteError = new Error("socket closed");
  await assert.rejects(automations.remove("task-1"), (error) => error instanceof IntegrationError && error.kind === "unreachable");
  port.deleteError = new IntegrationError("refused", { system: "t3", kind: "refused" });
  await assert.rejects(automations.remove("task-1"), (error) => error instanceof IntegrationError && error.kind === "refused");
});

function harness(threads: RawThread[] = [thread("run-1")], runs?: AutomationRunLog) {
  const port = new FakePort();
  // A thread whose first message exists but has no task id.
  port.projection = { messages: [{ id: "m", role: "user" }] };
  const warnings: string[] = [];
  const automations = createAutomations({
    warn: (message) => void warnings.push(message),
    port,
    store: { project: (id) => (id === "project-1" ? { id, title: "Project A", defaultModelSelection: null, icon: null } : undefined), rawThreads: () => threads },
    dedicated: { read: () => new Set(["t-dedicated"]) },
    newId: () => "id-1",
    now: () => new Date(2026, 10, 4, 10, 0, 0),
    runs,
  });
  return { automations, port, warnings };
}

const base = { title: "", prompt: "  Triage the inbox\nand reply ", projectId: "project-1", modelSelection: { instanceId: "claudeAgent", model: "m" } };
const routine: CreateAutomationBody = { ...base, kind: "routine", schedule: { type: "interval", everyMinutes: 15 } };
const expected = {
  id: "scheduled-task:id-1",
  enabled: true,
  projectId: "project-1",
  threadId: null,
  workspaceStrategy: { type: "root" },
  modelSelection: { instanceId: "claudeAgent", model: "m" },
  runtimeMode: "full-access",
  interactionMode: "default",
  creationSource: "web",
};

test("create sends a routine as an unbound T3 task and maps the result", async () => {
  const { automations, port } = harness();
  const result = await automations.create(routine);
  assert.deepEqual(port.createdTasks, [{ ...expected, title: "Triage the inbox", prompt: "Triage the inbox\nand reply", schedule: { type: "interval", everyMs: 900_000 } }]);
  assert.deepEqual(result, { ok: true, id: "scheduled-task:id-1", webhookUrl: null, nextRunAt: "2026-11-05T09:00:00.000Z" });
});

test("create keeps a given title and runtime mode, and cuts a long first line to 60 characters", async () => {
  const { automations, port } = harness();
  await automations.create({ ...routine, title: " Inbox ", runtimeMode: "auto" });
  await automations.create({ ...routine, prompt: "x".repeat(100) });
  assert.equal(port.createdTasks[0]!.title, "Inbox");
  assert.equal(port.createdTasks[0]!.runtimeMode, "auto");
  assert.equal(port.createdTasks[1]!.title.length, 60);
});

test("create sends a reminder with the exact time, a Reminder title and the prompt as written", async () => {
  const { automations, port } = harness();
  await automations.create({ ...base, kind: "reminder", title: "Call Sam", prompt: "Call Sam", at: new Date(2026, 10, 4, 17, 30).toISOString() });
  const [sent] = port.createdTasks;
  assert.equal(sent!.title, "Reminder: Call Sam");
  assert.deepEqual(sent!.schedule, { type: "fixed_time", timeOfDay: "17:30", weekdays: [new Date(2026, 10, 4).getDay()] });
  assert.equal(sent!.prompt, "Call Sam");
});

test("a created reminder is listed as a reminder without its prefix", async () => {
  const { automations, port } = harness();
  await automations.create({ ...base, kind: "reminder", title: "Call Sam", prompt: "Call Sam", at: new Date(2026, 10, 4, 17, 30).toISOString() });
  port.scheduledTasks = port.createdTasks.map((created) => ({ id: created.id, title: created.title, prompt: created.prompt, schedule: created.schedule }));
  const [item] = (await automations.list()).automations;
  assert.deepEqual([item!.kind, item!.title], ["reminder", "Call Sam"]);
});

test("create refuses a reminder in the past without calling T3", async () => {
  const { automations, port } = harness();
  await assert.rejects(automations.create({ ...base, kind: "reminder", at: new Date(2026, 10, 4, 9).toISOString() }), (error) => error instanceof DomainError && error.code === "invalid");
  assert.deepEqual(port.createdTasks, []);
});

test("create sends a webhook with its filters and signature, and returns the URL", async () => {
  const { automations, port } = harness();
  port.createdWebhookUrl = "https://relay.example.invalid/v1/hooks/k/t/token";
  const signature = { header: "x-hub-signature-256", encoding: "hex" as const, prefix: "sha256=", secret: "s3cret" };
  const filters = [{ path: "headers.x-github-event", op: "equals" as const, value: "pull_request" }];
  const result = await automations.create({ ...base, kind: "webhook", filters, signature });
  assert.deepEqual(port.createdTasks[0]!.schedule, { type: "webhook", signature, filters });
  assert.equal(port.createdTasks[0]!.title, "Triage the inbox");
  assert.equal(result.webhookUrl, "https://relay.example.invalid/v1/hooks/k/t/token");
  assert.equal(JSON.stringify(result).includes("s3cret"), false);
});

test("create uses T3's No project when the project is empty", async () => {
  const { automations, port } = harness();
  await automations.create({ ...routine, projectId: "" });
  assert.equal(port.createdTasks[0]!.projectId, "scratch-project");
});

test("create wraps a port failure as a T3 error and keeps an integration error", async () => {
  const { automations, port } = harness();
  port.createError = new Error("socket closed");
  await assert.rejects(automations.create(routine), (error) => error instanceof IntegrationError && error.kind === "unreachable");
  const refused = new IntegrationError("T3 refused the scheduled task.", { system: "t3", kind: "refused" });
  port.createError = refused;
  await assert.rejects(automations.create(routine), (error) => error === refused);
});

test("list converts the tasks of T3 with the live threads and the dedicated set", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ threadId: "t-dedicated" }), task({ id: "task-2", threadId: null })];
  const result = await automations.list();
  assert.deepEqual(result.automations.map((item) => [item.id, item.threadId]), [["task-1", "t-dedicated"], ["task-2", "run-1"]]);
  assert.deepEqual(result.automationThreadIds.sort(), ["run-1", "t-dedicated"]);
});

test("list logs the runs, saves them once and returns them", async () => {
  const saved: RunLog[] = [];
  const { automations, port } = harness([thread("run-1", { status: "completed", latestRunCompletedAt: "2026-03-20T10:05:00.000Z" })], new AutomationRunLog({}, (log) => void saved.push(log)));
  port.scheduledTasks = [task()];
  const first = await automations.list();
  assert.deepEqual(first.automations[0]!.runs.map((run) => [run.threadId, run.status]), [["run-1", "succeeded"]]);
  await automations.list();
  assert.equal(saved.length, 1);
});

test("remove drops the runs of the deleted task", async () => {
  const saved: RunLog[] = [];
  const { automations, port } = harness([thread("run-1", { status: "completed", latestRunCompletedAt: "2026-03-20T10:05:00.000Z" })], new AutomationRunLog({}, (log) => void saved.push(log)));
  port.scheduledTasks = [task()];
  await automations.list();
  await automations.remove("task-1");
  assert.deepEqual(saved.at(-1), {});
});

test("list turns a plain port error into a T3 error and keeps an integration error", async () => {
  const { automations, port } = harness();
  port.scheduledTasksError = new Error("socket closed");
  await assert.rejects(automations.list(), (error) => error instanceof IntegrationError && error.system === "t3" && error.kind === "unreachable");
  const original = new IntegrationError("old T3", { system: "t3", kind: "protocol" });
  port.scheduledTasksError = original;
  await assert.rejects(automations.list(), (error) => error === original);
});

test("a routine schedule comes back in the units of the form", () => {
  const schedules = [
    task({ id: "a", schedule: { type: "interval", everyMs: 90_000 } }),
    task({ id: "b", schedule: { type: "interval", everyMs: 100 } }),
    task({ id: "c", schedule: { type: "fixed_time", timeOfDay: "09:30", weekdays: [1, 3] } }),
    task({ id: "d", schedule: { type: "fixed_time", timeOfDay: "23:00" } }),
    task({ id: "e", title: "Reminder: x" }),
    task({ id: "f", schedule: { type: "webhook" } }),
  ];
  assert.deepEqual(convert(schedules).automations.map((item) => item.schedule), [
    { type: "interval", everyMinutes: 2 },
    { type: "interval", everyMinutes: 1 },
    { type: "fixed_time", timeOfDay: "09:30", weekdays: [1, 3] },
    { type: "fixed_time", timeOfDay: "23:00", weekdays: [] },
    null,
    null,
  ]);
});

test("a task shows its prompt, runtime mode and whether a thread binds it", () => {
  const [known, unknown, bound] = convert([task({ runtimeMode: "auto", prompt: "Do X" }), task({ id: "b", runtimeMode: "future-mode" }), task({ id: "c", threadId: "t-1" })]).automations;
  assert.deepEqual([known!.prompt, known!.runtimeMode, known!.bound], ["Do X", "auto", false]);
  assert.deepEqual([unknown!.runtimeMode, bound!.bound], [null, true]);
});

test("a webhook shows its valid filters and how it is signed, never a secret", () => {
  const signature = { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=" };
  const filters = [{ path: "body.action", op: "equals", value: "opened" }, { path: "body.ref", op: "in", value: ["a", "b"] }, { path: "body.pr", op: "exists" }, { op: "equals", value: "x" }, { path: "body.n", op: "equals", value: 5 }, { path: "body.m", op: "future" }, null];
  const [hook, unsigned] = convert([task({ schedule: { type: "webhook", signature, filters }, webhook: { url: null, hasSecret: true } }), task({ id: "b", schedule: { type: "webhook", signature: { header: "h", encoding: "future", prefix: "" } } })]).automations;
  assert.deepEqual(hook!.webhook, { url: null, signed: true, filters: [{ path: "body.action", op: "equals", value: "opened" }, { path: "body.ref", op: "in", value: ["a", "b"] }, { path: "body.pr", op: "exists" }], signature });
  assert.deepEqual([unsigned!.webhook?.filters, unsigned!.webhook?.signature], [[], null]);
});

const edit: UpdateAutomationBody = { ...base, kind: "routine", schedule: { type: "fixed_time", timeOfDay: "09:30", weekdays: [] } };
const changed = { prompt: "Triage the inbox\nand reply", projectId: "project-1", modelSelection: { instanceId: "claudeAgent", model: "m" }, runtimeMode: "full-access" };

test("update sends the whole form to T3 and keeps the enabled flag of a routine", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ enabled: false, runtimeMode: "auto" })];
  await automations.update("task-1", edit);
  assert.deepEqual(port.updatedTasks, [{ id: "task-1", ...changed, runtimeMode: "auto", title: "Triage the inbox", enabled: false, schedule: { type: "fixed_time", timeOfDay: "09:30" } }]);
  assert.deepEqual(port.commands, []);
});

test("update refuses an unknown task and a change of kind", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task()];
  const code = (id: string, body: UpdateAutomationBody) => automations.update(id, body).then(() => null, (error: DomainError) => error.code);
  assert.equal(await code("nope", edit), "not-found");
  assert.equal(await code("task-1", { ...base, kind: "reminder", at: new Date(2026, 10, 4, 15, 0).toISOString() }), "invalid");
  assert.equal(await code("task-1", { ...base, kind: "webhook", filters: [], signature: null }), "invalid");
  assert.deepEqual(port.updatedTasks, []);
});

test("update keeps the reminder prefix, re-arms a paused reminder and refuses a past time", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ title: "Rappel : Appeler Paul", enabled: false })];
  const at = new Date(2026, 10, 4, 15, 0);
  await automations.update("task-1", { ...base, title: "Call Anna", kind: "reminder", at: at.toISOString() });
  assert.deepEqual(port.updatedTasks.map((update) => [update.title, update.enabled, update.schedule]), [["Reminder: Call Anna", true, { type: "fixed_time", timeOfDay: "15:00", weekdays: [at.getDay()] }]]);
  await assert.rejects(automations.update("task-1", { ...base, kind: "reminder", at: new Date(2026, 10, 4, 9, 0).toISOString() }), DomainError);
  assert.equal(port.updatedTasks.length, 1);
});

test("update uses the project of the form, and the scratch project when it is empty", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task()];
  await automations.update("task-1", { ...edit, projectId: "project-2" });
  await automations.update("task-1", { ...edit, projectId: "" });
  assert.deepEqual(port.updatedTasks.map((update) => update.projectId), ["project-2", "scratch-project"]);
});

test("update keeps the project of a bound task and renames its thread only when the title changes", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ threadId: "t-dedicated", title: "Inbox triage" })];
  await automations.update("task-1", { ...edit, title: "Inbox triage", projectId: "project-2" });
  assert.deepEqual([port.updatedTasks[0]!.projectId, port.commands], ["project-1", []]);
  await automations.update("task-1", { ...edit, title: "Daily triage" });
  assert.deepEqual(port.commands, [{ type: "thread.metadata.update", threadId: "t-dedicated", title: "Daily triage", commandId: "id-1" }]);
});

test("update passes a webhook signature without a secret through, and clears no filter by itself", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ schedule: { type: "webhook" } })];
  const signature = { header: "x-hub-signature-256", encoding: "hex" as const, prefix: "sha256=" };
  await automations.update("task-1", { ...base, kind: "webhook", filters: [], signature });
  assert.deepEqual(port.updatedTasks[0]!.schedule, { type: "webhook", signature, filters: [] });
});

test("update keeps the stored runtime mode when the form sends none, and falls back to full access", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ id: "a", runtimeMode: "approval-required" }), task({ id: "b", runtimeMode: "future-mode" })];
  await automations.update("a", edit);
  await automations.update("b", edit);
  await automations.update("b", { ...edit, runtimeMode: "auto" });
  assert.deepEqual(port.updatedTasks.map((update) => update.runtimeMode), ["approval-required", "full-access", "auto"]);
});

test("update keeps the thread as it is when T3 refuses the task update, and wraps a plain error", async () => {
  const { automations, port } = harness();
  port.scheduledTasks = [task({ threadId: "t-dedicated" })];
  port.updateError = new IntegrationError("refused", { system: "t3", kind: "refused" });
  await assert.rejects(automations.update("task-1", { ...edit, title: "New" }), IntegrationError);
  assert.deepEqual(port.commands, []);
  port.updateError = new Error("socket closed");
  await assert.rejects(automations.update("task-1", edit), (error) => error instanceof IntegrationError && error.kind === "unreachable");
});

test("update marks a reminder that ran as re-armed, and a routine or a fresh reminder as nothing", async () => {
  const marks: Record<string, string>[] = [];
  const rearmed = new RearmedStore({}, (next) => marks.push(next));
  const port = new FakePort();
  const automations = createAutomations({ port, rearmed, store: { project: () => undefined, rawThreads: () => [] }, dedicated: { read: () => new Set() }, now: () => new Date(2026, 10, 4, 10, 0, 0) });
  const at = new Date(2026, 10, 4, 15, 0).toISOString();
  port.scheduledTasks = [task({ title: "Reminder: Call", enabled: false, lastRunAt: "2026-11-03T09:00:00.000Z" }), task({ id: "task-2", title: "Fresh", lastRunAt: null })];
  await automations.update("task-1", { ...base, kind: "reminder", at });
  assert.deepEqual(marks, [{ "task-1": "2026-11-03T09:00:00.000Z" }]);
  port.scheduledTasks = [task({ title: "Triage", lastRunAt: "2026-11-03T09:00:00.000Z" })];
  await automations.update("task-1", edit);
  port.scheduledTasks = [task({ id: "task-3", title: "Reminder: New", lastRunAt: null })];
  await automations.update("task-3", { ...base, kind: "reminder", at });
  assert.equal(marks.length, 1);
});

test("a failed update rolls back only the mark it added", async () => {
  const lastRunAt = "2026-11-03T09:00:00.000Z";
  const at = new Date(2026, 10, 4, 15, 0).toISOString();
  const port = new FakePort();
  const make = (rearmed: RearmedStore) => createAutomations({ port, rearmed, store: { project: () => undefined, rawThreads: () => [] }, dedicated: { read: () => new Set() }, now: () => new Date(2026, 10, 4, 10, 0, 0) });
  port.scheduledTasks = [task({ title: "Reminder: Call", enabled: false, lastRunAt })];
  port.updateError = new Error("socket closed");

  const fresh = new RearmedStore();
  await assert.rejects(make(fresh).update("task-1", { ...base, kind: "reminder", at }));
  assert.equal(fresh.has("task-1", lastRunAt), false);

  const earlier = new RearmedStore({ "task-1": lastRunAt });
  await assert.rejects(make(earlier).update("task-1", { ...base, kind: "reminder", at }));
  assert.equal(earlier.has("task-1", lastRunAt), true);
});

test("setEnabled and runNow reach T3, and an unknown automation is not found", async () => {
  const port = new FakePort();
  const automations = createAutomations({ port, store: { project: () => undefined, rawThreads: () => [] }, dedicated: { read: () => new Set() } });
  port.scheduledTasks = [task({})];
  await automations.setEnabled("task-1", false);
  await automations.runNow("task-1");
  assert.deepEqual(port.enabledCalls, [{ id: "task-1", enabled: false }]);
  assert.deepEqual(port.runNowCalls, ["task-1"]);
  for (const call of [() => automations.setEnabled("nope", true), () => automations.runNow("nope")]) {
    await assert.rejects(call, (error: DomainError) => error.code === "not-found");
  }
  assert.equal(port.enabledCalls.length + port.runNowCalls.length, 2);
  port.runNowError = new Error("T3 is down");
  await assert.rejects(automations.runNow("task-1"), (error: IntegrationError) => error.kind === "unreachable");
});

const stamped = (taskId: string | null): RawProjection => ({ messages: [{ id: "m", role: "user", ...(taskId && { scheduledTaskId: taskId }) }] });
const runIds = (result: Awaited<ReturnType<ReturnType<typeof harness>["automations"]["list"]>>, index = 0) => result.automations[index]!.runs.map((run) => run.threadId);

test("list links a new run by the scheduledTaskId of its thread, even with another title", async () => {
  const { automations, port } = harness([thread("run-1", { title: "Renamed by the user" }), thread("run-2")]);
  port.scheduledTasks = [task(), task({ id: "task-2" })];
  port.projections = { "run-1": stamped("task-1"), "run-2": stamped("task-2") };
  const result = await automations.list();
  assert.deepEqual([runIds(result, 0), runIds(result, 1)], [["run-1"], ["run-2"]]);
  assert.deepEqual(result.automationThreadIds.filter((id) => id !== "t-dedicated").sort(), ["run-1", "run-2"]);
});

test("a thread linked to a task by id is not taken by another task with its title", async () => {
  const { automations, port } = harness([thread("run-1")]);
  port.scheduledTasks = [task({ id: "task-other", title: "Other" }), task()];
  port.projections = { "run-1": stamped("task-other") };
  const result = await automations.list();
  assert.deepEqual([runIds(result, 0), runIds(result, 1)], [["run-1"], []]);
});

test("a renamed run thread and a renamed task keep their runs on the next lists", async () => {
  const threads = [thread("run-1")];
  const { automations, port } = harness(threads);
  port.scheduledTasks = [task()];
  port.projections = { "run-1": stamped("task-1") };
  await automations.list();
  threads[0] = thread("run-1", { title: "Renamed", status: "running", activeRunId: "r", latestRunCompletedAt: null });
  threads.push(thread("run-2", { title: "New title", createdAt: "2026-03-21T10:00:00.000Z" }));
  port.scheduledTasks = [task({ title: "New title" })];
  port.projections["run-2"] = stamped("task-1");
  const result = await automations.list();
  assert.deepEqual(result.automations[0]!.runs.map((run) => [run.threadId, run.status]), [["run-2", "unknown"], ["run-1", "running"]]);
  assert.equal(result.automations[0]!.threadId, "run-2");
  assert.deepEqual(result.automationThreadIds.filter((id) => id !== "t-dedicated").sort(), ["run-1", "run-2"]);
});

test("a thread is probed once, and a probe that fails is tried again", async () => {
  const { automations, port } = harness([thread("run-1"), thread("run-2", { title: "Renamed" })]);
  port.scheduledTasks = [task()];
  port.projections = { "run-2": stamped("task-1") };
  port.projectionFailures.add("run-2");
  await automations.list();
  await automations.list();
  assert.equal(port.projectionCalls, 3);
  port.projectionFailures.clear();
  const result = await automations.list();
  assert.equal(port.projectionCalls, 4);
  assert.deepEqual(runIds(result).sort(), ["run-1", "run-2"]);
});

test("a list is not broken by a probe error and falls back to the title", async () => {
  const { automations, port } = harness([thread("run-1")]);
  port.scheduledTasks = [task()];
  port.projectionError = new Error("T3 is unreachable");
  assert.deepEqual(runIds(await automations.list()), ["run-1"]);
});

test("a list probes at most 30 threads, 4 at a time, and the rest on the next call", async () => {
  const threads = Array.from({ length: 35 }, (_, index) => thread(`run-${index}`, { createdAt: new Date(Date.parse("2026-03-21T00:00:00.000Z") + index * 60_000).toISOString() }));
  const { automations, port } = harness(threads);
  port.scheduledTasks = [task()];
  port.projectionGate = () => new Promise((resolve) => setTimeout(resolve, 1));
  await automations.list();
  assert.equal(port.projectionCalls, 30);
  assert.equal(port.peakProjectionsInFlight, 4);
  await automations.list();
  assert.equal(port.projectionCalls, 35);
});

test("only candidate threads are probed", async () => {
  const { automations, port } = harness([
    thread("old", { createdAt: "2026-03-01T00:00:00.000Z" }),
    thread("archived", { archivedAt: "2026-03-21T00:00:00.000Z" }),
    thread("web", { creationSource: "web" }),
    thread("chat", {}),
    thread("candidate"),
  ]);
  port.scheduledTasks = [task(), task({ id: "bound", threadId: "chat" })];
  await automations.list();
  assert.equal(port.projectionCalls, 1);
});

test("a stored thread that was never probed is probed, and its id wins over the stored link", async () => {
  const log = new AutomationRunLog({ "task-1": [{ threadId: "run-1", startedAt: "2026-03-20T10:00:00.000Z", finishedAt: null, status: "succeeded", error: null }], "task-2": [{ threadId: "run-1", startedAt: "2026-03-20T10:00:00.000Z", finishedAt: null, status: "succeeded", error: null }] });
  const { automations, port } = harness([thread("run-1")], log);
  port.scheduledTasks = [task(), task({ id: "task-2" })];
  port.projections = { "run-1": stamped("task-2") };
  const result = await automations.list();
  assert.deepEqual([runIds(result, 0), runIds(result, 1)], [[], ["run-1"]]);
});

test("a projection with no user message is not cached and is probed again", async () => {
  const { automations, port } = harness([thread("run-1")]);
  port.scheduledTasks = [task()];
  port.projections = { "run-1": { messages: [] } };
  await automations.list();
  await automations.list();
  assert.equal(port.projectionCalls, 2);
  port.projections = { "run-1": stamped(null) };
  await automations.list();
  await automations.list();
  assert.equal(port.projectionCalls, 3);
});
