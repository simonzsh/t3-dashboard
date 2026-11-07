import assert from "node:assert/strict";
import { test } from "bun:test";
import { DemoPort, demoLinearFetch } from "../../src/app/demo/port.ts";
import { DEMO_HOME, DEMO_NEWS_DIR, createDemoCacheCleanup, demoNews, demoFixtures, demoServerStats, demoUsageBuckets } from "../../src/app/demo/fixtures.ts";
import { issues } from "../../src/integrations/contract.ts";
import { inboxItems } from "../../src/domain/linearBoard.ts";
import { LinearClient } from "../../src/integrations/linear/client.ts";
import { RawConfig, RawProjection, RawProject, RawThread, UsageSummaryResponse } from "../../src/integrations/t3/schemas.ts";
import { ShellStore } from "../../src/domain/shellStore.ts";
import { toLimitsOverview } from "../../src/domain/providerLimits.ts";
import { toProviders } from "../../src/domain/providers.ts";
import { createActions } from "../../src/domain/actions.ts";
import { createAutomations } from "../../src/domain/automations.ts";
import { createNews } from "../../src/domain/news.ts";
import { isArticleName } from "../../src/config/newsFile.ts";
import { agentStatus } from "../../shared/status.ts";

const NOW = new Date("2026-10-26T10:00:00Z");

function syncedStore(port: DemoPort): ShellStore {
  const store = new ShellStore({ now: () => NOW, onState() {}, onThreads() {}, onProjects() {} });
  store.beginSync();
  port.subscribeShell((items) => store.apply(items));
  return store;
}

test("the demo fixtures match the T3 schemas", () => {
  const { projects, threads, projections, config } = demoFixtures(NOW);
  for (const project of projects) assert.deepEqual(issues(RawProject, project), [], project.id);
  for (const thread of threads) assert.deepEqual(issues(RawThread, thread), [], thread.id);
  for (const [id, projection] of Object.entries(projections)) assert.deepEqual(issues(RawProjection, projection), [], id);
  assert.deepEqual(issues(RawConfig, config), []);
  assert.deepEqual(toProviders(config).map((provider) => provider.displayName), ["Claude", "Codex"]);
});

test("refreshProviders moves the demo check time to now", async () => {
  const port = new DemoPort(() => NOW);
  const checked = async () => toLimitsOverview(await port.getConfig(), NOW).providers.map((p) => p.checkedAt);
  assert.deepEqual(new Set(await checked()), new Set(["2026-10-26T09:59:00.000Z"]));
  await port.refreshProviders();
  assert.deepEqual(new Set(await checked()), new Set([NOW.toISOString()]));
});

test("the demo config carries usage limits that show every pace", async () => {
  const config = await new DemoPort(() => NOW).getConfig();
  assert.deepEqual(issues(RawConfig, config), []);
  const { supported, providers } = toLimitsOverview(config, NOW);
  assert.equal(supported, true);
  const byId = Object.fromEntries(providers.map((p) => [p.instanceId, p]));
  assert.deepEqual([byId.codex!.windows.length, byId.codex!.resetCredits], [2, 2]);
  assert.deepEqual([byId.claudeAgent!.windows.length, byId.claudeAgent!.resetCredits], [3, 0]);
  const share = (id: string, provider: string) => {
    const w = byId[provider]!.windows.find((window) => window.id === id)!;
    const total = w.windowMinutes! * 60_000;
    return Math.round(w.usedPercent - ((total - (Date.parse(w.resetsAt!) - NOW.getTime())) / total) * 100);
  };
  // Used share minus elapsed share: over +5 is ahead, under -5 is headroom.
  assert.ok(share("primary", "codex") > 5);
  assert.ok(Math.abs(share("seven_day", "claudeAgent")) <= 5);
  assert.ok(share("five_hour", "claudeAgent") < -5);
});

test("the demo usage gives the same numbers to a day in a short and in a long range", async () => {
  const port = new DemoPort(() => NOW);
  const short = await port.usageSummary({ sinceDay: "2026-10-13", untilDay: "2026-10-26", timeZone: "UTC" });
  const long = await port.usageSummary({ sinceDay: "2026-08-28", untilDay: "2026-10-26", timeZone: "UTC" });
  assert.equal(new Set(long.buckets.map((bucket) => bucket.day)).size, 60);
  assert.deepEqual(long.buckets.filter((bucket) => bucket.day >= "2026-10-13"), short.buckets);
  const year = await port.usageSummary({ sinceDay: "2026-04-30", untilDay: "2026-10-26", timeZone: "UTC" });
  assert.deepEqual(issues(UsageSummaryResponse, year), []);
  assert.equal(new Set(year.buckets.map((bucket) => bucket.day)).size, 180);
});

test("the demo usage matches the T3 schema and shows a partial cost over 14 days", async () => {
  const usage = await new DemoPort(() => NOW).usageSummary({ sinceDay: "2026-10-13", untilDay: "2026-10-26", timeZone: "UTC" });
  assert.deepEqual(issues(UsageSummaryResponse, usage), []);
  assert.deepEqual(usage, demoUsageBuckets("2026-10-13", "2026-10-26"));
  const days = new Set(usage.buckets.map((bucket) => bucket.day));
  assert.equal(days.size, 14);
  assert.ok(usage.buckets.every((bucket) => (bucket.costUsd ?? 0) >= 0));
  assert.ok(usage.buckets.some((bucket) => (bucket.unpricedRecords ?? 0) > 0));
  assert.ok(usage.buckets.some((bucket) => (bucket.costUsd ?? 0) > 0));
});

test("the demo threads have runs on several days", async () => {
  const { projections } = demoFixtures(NOW);
  const days = new Set(Object.values(projections).flatMap((projection) => (projection.runs ?? []).map((run) => run.startedAt?.slice(0, 10))));
  assert.ok(days.size >= 5, [...days].join(","));
});

test("the demo shell fills the store with threads in every state", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const state = store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, []);
  assert.equal(state.projects.length, demoFixtures(NOW).projects.length);
  assert.ok(state.threads.length >= 8);
  const statuses = new Set(state.threads.map(agentStatus));
  assert.deepEqual([...statuses].sort(), ["finished", "waiting", "working"]);
  assert.ok(state.threads.some((thread) => thread.settled));
});

test("demo thread details show messages, activity, subagents and requests", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) } });
  const details = await Promise.all(store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, []).threads.map((thread) => actions.threadDetail(thread.id)));
  assert.ok(details.every((detail) => detail.messages.length > 0));
  assert.ok(details.some((detail) => detail.steps.length > 0 && detail.subagents.length >= 2));
  assert.deepEqual(details.flatMap((detail) => detail.pendingRequests.map((request) => request.category)).sort(), ["approval", "user-input"]);
});

test("a message sent in the demo lands in its thread", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) } });
  const threadId = await actions.createThread({ projectId: "", title: "Try the demo", text: "Hello", modelSelection: { instanceId: "claudeAgent", model: "claude-opus-5-5" } }, []);
  assert.equal(store.thread(threadId)?.title, "Try the demo");
  await actions.sendMessage(threadId, { text: "Second message" }, []);
  const detail = await actions.threadDetail(threadId);
  assert.deepEqual(detail.messages.map((message) => message.text), ["Hello", "Second message"]);
});

test("the demo serves steps of every kind, each with its detail", async () => {
  const { actions, threadId } = await runningDemo();
  const { steps } = await actions.threadDetail(threadId);
  const kinds = new Set(steps.map((step) => step.kind));
  for (const kind of ["thinking", "command", "tool", "file", "todo", "plan", "subagent", "notice"]) assert.ok(kinds.has(kind as never), kind);
  const command = steps.find((step) => step.id === "a7")!;
  assert.equal(command.status, "done");
  assert.match((await actions.stepDetail(threadId, "a7")).output!, /2 pass/);
  assert.equal(steps.find((step) => step.id === "a7b")!.status, "failed");
  assert.equal((await actions.stepDetail(threadId, "a7b")).exitCode, 2);
  assert.match((await actions.stepDetail(threadId, "a3")).diff!, /^--- a\/web\/src\/checkout\/OrderSummary\.tsx/);
  assert.match((await actions.stepDetail(threadId, "a6")).diff!, /^--- a\/web\/src\/checkout\/summary\.css/);
  assert.equal((await actions.stepDetail(threadId, "a8")).output, "Opened http://localhost:5173/checkout (375 x 812)");
  await assert.rejects(actions.stepDetail(threadId, "nope"));
});

test("the demo subagent step points to a child thread whose steps load but which the shell hides", async () => {
  const { actions, threadId, store } = await runningDemo();
  const sub = (await actions.threadDetail(threadId)).steps.find((step) => step.id === "a5")!.subagent!;
  assert.deepEqual([sub.subagentId, sub.stoppable, sub.progress], ["sub-mobile", true, "Testing 375 px and 768 px widths"]);
  assert.ok(sub.childThreadId);
  assert.equal(store.thread(sub.childThreadId!), undefined);
  const child = await actions.threadDetail(sub.childThreadId!);
  assert.deepEqual(child.steps.map((step) => step.kind), ["thinking", "command", "command"]);
});

test("the demo searches files and stores uploads", async () => {
  const { actions, threadId } = await runningDemo();
  const found = await actions.searchFiles(threadId, "summary", 2);
  assert.deepEqual(found.entries.map((entry) => entry.path), ["web/src/checkout/OrderSummary.tsx", "web/src/checkout/OrderSummary.test.tsx"]);
  assert.equal(found.truncated, true);
  const ref = await actions.uploadAttachment({ type: "file", name: "a.txt", mimeType: "text/plain", sizeBytes: 1, bytes: new Uint8Array([1]) });
  await actions.sendMessage(threadId, { text: "see file", mode: "steer" }, [], [ref]);
  const message = (await actions.threadDetail(threadId)).messages.at(-1)!;
  assert.deepEqual(message.attachments, [{ id: ref.id, name: "a.txt", kind: "file", mimeType: "text/plain", sizeBytes: 1 }]);
});

test("the demo lists commands and skills, reports the context size and compacts it", async () => {
  const { actions, threadId } = await runningDemo();
  const { commands, skills } = await actions.composerCommands(threadId, "claudeAgent");
  assert.ok(commands.some((command) => command.name === "compact"));
  assert.ok(skills.some((skill) => skill.name === "simplify"));
  const usage = (await actions.threadDetail(threadId)).contextUsage;
  assert.deepEqual([usage?.usedTokens, usage?.maxTokens], [722_000, 1_000_000]);
  const before = (await actions.threadDetail(threadId)).messages.length;
  await actions.sendMessage(threadId, { text: "/compact" }, []);
  const after = await actions.threadDetail(threadId);
  assert.deepEqual([after.contextUsage!.usedTokens < 722_000, after.messages.length], [true, before]);
});

async function runningDemo() {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) } });
  const threadId = store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, []).threads.find((thread) => thread.title.includes("heckout"))!.id;
  return { actions, threadId, store };
}

test("a message sent during a demo run waits in the queue until Steer", async () => {
  const { actions, threadId } = await runningDemo();
  await actions.sendMessage(threadId, { text: "Later" }, []);
  let detail = await actions.threadDetail(threadId);
  assert.deepEqual(detail.queue.map((item) => item.text), ["Later"]);
  assert.equal(detail.messages.some((message) => message.text === "Later"), false);
  await actions.editQueued(threadId, detail.queue[0]!.runId, "Later, edited");
  await actions.sendQueued(threadId, detail.queue[0]!.runId);
  detail = await actions.threadDetail(threadId);
  assert.deepEqual(detail.queue, []);
  assert.equal(detail.messages.at(-1)?.text, "Later, edited");
});

test("a removed demo queued message is in neither the queue nor the conversation", async () => {
  const { actions, threadId } = await runningDemo();
  await actions.sendMessage(threadId, { text: "Oops" }, []);
  await actions.cancelQueued(threadId, (await actions.threadDetail(threadId)).queue[0]!.runId);
  const detail = await actions.threadDetail(threadId);
  assert.deepEqual(detail.queue, []);
  assert.equal(detail.messages.some((message) => message.text === "Oops"), false);
});

test("after a Stop the demo queue is held and Send now starts the message", async () => {
  const { actions, threadId } = await runningDemo();
  await actions.sendMessage(threadId, { text: "Next" }, []);
  await actions.interrupt(threadId);
  let detail = await actions.threadDetail(threadId);
  assert.equal(detail.queueHeld, true);
  await actions.sendQueued(threadId, detail.queue[0]!.runId);
  detail = await actions.threadDetail(threadId);
  assert.deepEqual([detail.queue.length, detail.queueHeld, detail.messages.at(-1)?.text], [0, false, "Next"]);
  assert.equal(detail.thread?.status, "running");
});

test("the demo Linear board and automations need no network", async () => {
  const issuesList = await new LinearClient(demoLinearFetch(NOW)).assignedIssues("demo");
  assert.ok(new Set(issuesList.map((issue) => issue.state.name)).size >= 4);
  assert.ok(issuesList.some((issue) => issue.priority === 1));
  // The two due dates sit 2 days before and 1 day after the local day.
  const today = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());
  const day = (offset: number) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset).toLocaleDateString("sv");
  assert.deepEqual(issuesList.flatMap((issue) => (issue.dueDate ? [issue.dueDate] : [])).sort(), [day(-2), day(1)]);
  const items = inboxItems(await new LinearClient(demoLinearFetch(NOW)).inbox("demo"), NOW);
  assert.deepEqual(items.map((item) => item.kind).sort(), ["assigned", "assigned", "comment-mention", "mention"]);
  assert.ok(new Set(items.filter((item) => item.kind !== "assigned").map((item) => item.actor)).size === 2);
  assert.ok(items.every((item) => issuesList.some((issue) => issue.id === item.issue.id)));
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const { automations, automationThreadIds, setupThreadIds } = await createAutomations({ port, store, dedicated: { read: () => new Set(["demo-digest", "demo-setup"]) } }).list();
  assert.ok(automations.length >= 3 && automations.filter((automation) => automation.kind !== "webhook" && automation.enabled).every((automation) => automation.nextRunAt !== null));
  assert.ok(automations.some((automation) => automation.kind === "reminder"));
  const hooks = automations.filter((automation) => automation.kind === "webhook");
  assert.equal(hooks.length, 2);
  assert.ok(hooks.some((hook) => hook.webhook?.signed === true && hook.webhook.url !== null && hook.enabled && hook.runs.length === 2 && hook.lastRunStatus === "succeeded"));
  assert.ok(hooks.some((hook) => hook.webhook?.url === null && !hook.enabled));
  assert.ok(["demo-digest", "demo-setup", "demo-run-inbox-1", "demo-run-metrics-2"].every((id) => automationThreadIds.includes(id)));
  const inbox = automations.find((automation) => automation.id === "inbox-triage")!;
  assert.ok(inbox.runs.length > 1 && inbox.runs.some((run) => run.status === "failed") && inbox.runs.some((run) => run.status === "succeeded"));
  assert.ok(automations.find((automation) => automation.id === "dependency-check")!.runs.some((run) => run.threadId === null && run.status === "failed"));
  assert.ok(automations.find((automation) => automation.id === "metrics-snapshot")!.runs.some((run) => run.status === "running"));
  assert.equal((await port.threadProjection("demo-run-inbox-1")).messages?.[0]?.scheduledTaskId, "inbox-triage");
  assert.deepEqual(setupThreadIds, ["demo-setup"]);
  assert.equal(store.thread("demo-setup")?.status, "running");
  const reminder = automations.find((automation) => automation.kind === "reminder")!;
  assert.ok(store.thread(reminder.threadId!), "the reminder is bound to a conversation that stays in the grid");
  await port.deleteScheduledTask(reminder.id);
  const left = await port.listScheduledTasks();
  assert.equal(left.length, automations.length - 1);
  assert.ok(!left.some((task) => task.id === reminder.id));
});

test("demo create lists a webhook with a demo URL and no secret", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const automations = createAutomations({ port, store, dedicated: { read: () => new Set() }, newId: () => "new-1" });
  const signature = { header: "x-hub-signature-256", encoding: "hex" as const, prefix: "sha256=", secret: "s3cret-value" };
  const result = await automations.create({ kind: "webhook", title: "Hook", prompt: "Handle it", projectId: "", modelSelection: { instanceId: "claudeAgent", model: "m" }, filters: [{ path: "body.action", op: "exists" }], signature });
  assert.match(result.webhookUrl ?? "", /^https:\/\/relay\.example\.invalid\//);
  const listed = await automations.list();
  const hook = listed.automations.find((automation) => automation.id === result.id)!;
  assert.deepEqual([hook.kind, hook.title, hook.webhook?.signed], ["webhook", "Hook", true]);
  assert.deepEqual(hook.webhook?.filters, [{ path: "body.action", op: "exists" }]);
  assert.deepEqual(hook.webhook?.signature, { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=" });
  assert.equal(JSON.stringify([listed, result]).includes("s3cret-value"), false);
});

test("demo update changes the task and the bound thread, in memory", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const automations = createAutomations({ port, store, dedicated: { read: () => new Set() }, now: () => NOW });
  const reminder = (await automations.list()).automations.find((automation) => automation.kind === "reminder")!;
  const modelSelection = { instanceId: "codex", model: "gpt-5.5-codex" };
  await automations.update(reminder.id, { kind: "reminder", title: "Ping the team", prompt: "Ping them", projectId: "", modelSelection, runtimeMode: "approval-required", at: new Date(NOW.getTime() + 3 * 3_600_000).toISOString() });
  const updated = (await automations.list()).automations.find((automation) => automation.id === reminder.id)!;
  assert.deepEqual([updated.kind, updated.title, updated.prompt, updated.modelSelection, updated.runtimeMode, updated.enabled], ["reminder", "Ping the team", "Ping them", modelSelection, "approval-required", true]);
  assert.equal(store.thread(reminder.threadId!)?.title, "Ping the team");
});

test("demo update of a signed webhook without a secret keeps it signed, with its URL", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const automations = createAutomations({ port, store, dedicated: { read: () => new Set() } });
  const hook = (await automations.list()).automations.find((automation) => automation.webhook?.signed)!;
  const filters = [{ path: "body.action", op: "exists" as const }];
  await automations.update(hook.id, { kind: "webhook", title: hook.title, prompt: hook.prompt, projectId: hook.projectId, modelSelection: hook.modelSelection!, filters, signature: hook.webhook!.signature });
  const after = (await automations.list()).automations.find((automation) => automation.id === hook.id)!;
  assert.deepEqual([after.webhook?.signed, after.webhook?.url, after.webhook?.filters], [true, hook.webhook!.url, filters]);
  await automations.update(hook.id, { kind: "webhook", title: hook.title, prompt: hook.prompt, projectId: hook.projectId, modelSelection: hook.modelSelection!, filters, signature: null });
  assert.equal((await automations.list()).automations.find((automation) => automation.id === hook.id)!.webhook?.signed, false);
});

test("demo search is case-insensitive and gives one row per thread, the user's message first", async () => {
  const port = new DemoPort(() => NOW);
  const matches = await port.searchThreads("RATE LIMIT");
  const rows = matches.filter((match) => match.threadId === "demo-rate-limit");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.source, "user");
  assert.ok(rows[0]!.snippet.toLowerCase().includes("rate limit"));
  assert.equal(new Set(matches.map((match) => match.threadId)).size, matches.length);
});

test("demo search falls back to the assistant message and lists user matches first", async () => {
  const port = new DemoPort(() => NOW);
  const matches = await port.searchThreads("token bucket");
  assert.deepEqual(matches.map((match) => [match.threadId, match.source]), [["demo-rate-limit", "assistant"]]);
  const all = await port.searchThreads("the");
  const firstAssistant = all.findIndex((match) => match.source === "assistant");
  assert.ok(firstAssistant === -1 || all.slice(firstAssistant).every((match) => match.source === "assistant"));
});

test("demo search finds nothing for an unknown word and honours the limit", async () => {
  const port = new DemoPort(() => NOW);
  assert.deepEqual(await port.searchThreads("zzzqqq"), []);
  assert.equal((await port.searchThreads("the", 2)).length, 2);
});

test("demo search cuts long messages to 240 characters around the hit", async () => {
  const port = new DemoPort(() => NOW);
  const text = `${"a ".repeat(400)}needle${" b".repeat(400)}`;
  await port.dispatch({ type: "thread.create", threadId: "long", projectId: "p", title: "Long", runtimeMode: "full-access" });
  await port.dispatch({ type: "message.dispatch", threadId: "long", messageId: "m1", text });
  const [match] = await port.searchThreads("needle");
  assert.ok(match!.snippet.length <= 240);
  assert.ok(match!.snippet.includes("needle"));
  assert.ok(match!.snippet.startsWith("…") && match!.snippet.endsWith("…"));
});

test("stopping the running demo subagent turns it failed", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) } });
  const threadId = store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, []).threads.find((thread) => thread.title.includes("heckout"))!.id;
  const before = (await actions.threadDetail(threadId)).subagents.find((s) => s.stop === "subagent")!;
  await actions.stopSubagent(threadId, before.id);
  const after = (await actions.threadDetail(threadId)).subagents.find((s) => s.id === before.id)!;
  assert.deepEqual([after.status, after.stop], ["failed", null]);
});

test("interrupting the idle demo thread stops its background task", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) } });
  const threadId = "demo-dev-server";
  const before = (await actions.threadDetail(threadId)).subagents;
  assert.deepEqual(before.map((s) => [s.status, s.stop]), [["running", "thread"]]);
  await actions.interrupt(threadId);
  await Bun.sleep(0);
  assert.deepEqual((await actions.threadDetail(threadId)).subagents, []);
});

test("Edit from here in the demo removes the message and what followed", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) } });
  const id = store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, []).threads.find((thread) => thread.title.includes("dark mode"))!.id;
  const before = await actions.threadDetail(id);
  const first = before.messages.find((message) => message.role === "user")!;
  assert.equal(first.rewindable, true);
  await actions.rewind(id, first.id, false);
  assert.deepEqual((await actions.threadDetail(id)).messages, []);
});

test("the demo server stats are plausible, move over time and show an amber disk", () => {
  const a = demoServerStats(NOW);
  const b = demoServerStats(new Date(NOW.getTime() + 10_000));
  for (const percent of [a.cpu.usedPercent!, a.memory.usedPercent, a.disk!.usedPercent]) assert.ok(percent >= 0 && percent <= 100);
  assert.notEqual(a.cpu.usedPercent, b.cpu.usedPercent);
  assert.notEqual(a.memory.usedBytes, b.memory.usedBytes);
  assert.ok(a.disk!.usedPercent >= 75 && a.disk!.usedPercent < 90);
  assert.equal(a.disk!.path, "/home/demo");
});

test("demo runNow opens a running run thread that the task matches, and setEnabled pauses it", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const automations = createAutomations({ port, store, dedicated: { read: () => new Set() } });
  const before = (await automations.list()).automations.find((a) => a.id === "dependency-check")!;
  await automations.runNow("dependency-check");
  const task = (await port.listScheduledTasks()).find((entry) => entry.id === "dependency-check")!;
  assert.deepEqual([task.lastRunAt, task.lastRunStatus], [NOW.toISOString(), "running"]);
  const run = store.rawThreads().find((thread) => thread.title === task.title && thread.createdAt === NOW.toISOString())!;
  assert.deepEqual([run.projectId, run.creationSource, run.status], [task.projectId, task.creationSource, "running"]);
  const after = (await automations.list()).automations.find((a) => a.id === "dependency-check")!;
  assert.equal(after.runs.length, before.runs.length + 1);
  assert.equal(after.lastRunStatus, "running");
  await automations.setEnabled("dependency-check", false);
  assert.equal((await port.listScheduledTasks()).find((entry) => entry.id === "dependency-check")!.enabled, false);
  await automations.setEnabled("dependency-check", true);
  assert.equal((await port.listScheduledTasks()).find((entry) => entry.id === "dependency-check")!.enabled, true);
});

test("the demo edits and deletes a project with its threads", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  store.apply([{ kind: "synchronized" }]);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) }, home: DEMO_HOME });
  await Promise.resolve();
  await actions.updateProject("demo-sandbox", { title: "Playground", path: "~/src/notes", icon: { kind: "emoji", emoji: "🧪" } });
  const edited = store.project("demo-sandbox");
  assert.equal(edited?.title, "Playground");
  assert.equal(edited?.workspaceRoot, `${DEMO_HOME}/src/notes`);
  assert.deepEqual(edited?.iconSpec, { kind: "emoji", emoji: "🧪" });
  await assert.rejects(actions.updateProject("demo-sandbox", { path: "~/src/missing" }), /does not exist/);
  await assert.rejects(actions.updateProject("demo-sandbox", { path: "~/todo.txt" }), /file, not a folder/);

  const connection = { t3: "live", origin: null, serverVersion: null, protocolMismatch: false, error: null, since: "x", setup: null } as const;
  const { projects, threads } = store.state(connection, []);
  const target = projects.find((project) => threads.some((thread) => thread.projectId === project.id))!;
  await actions.deleteProject(target.id);
  const after = store.state(connection, []);
  assert.equal(after.projects.some((project) => project.id === target.id), false);
  assert.equal(after.threads.some((thread) => thread.projectId === target.id), false);
});

test("the demo lists its folders and adds a created folder as a project", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  store.apply([{ kind: "synchronized" }]);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: NOW.toISOString(), inbox: [], inboxError: null }) }, home: DEMO_HOME });
  const listed = await actions.browseFolders("~/src/");
  assert.deepEqual(listed.entries.map((entry) => entry.name), ["atlas-api", "atlas-web", "notes", "sandbox"]);
  assert.equal((await actions.browseFolders("~/src/new-thing")).kind, "missing");

  const created = await actions.createProject({ path: "~/src/new-thing" });
  assert.equal(created.created, true);
  const project = store.project(created.projectId);
  assert.equal(project?.title, "new-thing");
  assert.equal((await actions.browseFolders("~/src/new-thing")).kind, "directory");
  assert.deepEqual(await actions.createProject({ path: "~/src/new-thing/" }), { projectId: created.projectId, created: false });
  await assert.rejects(actions.createProject({ path: "~/todo.txt" }), /file, not a folder/);
  assert.deepEqual(await actions.createProject({ path: "~/src/sandbox" }), { projectId: "demo-sandbox", created: false });
});

test("the demo cache cleanup lists sizes, frees them once and then has nothing left", async () => {
  const cleanup = createDemoCacheCleanup();
  const before = await cleanup.sizes();
  assert.equal(before.supported, true);
  assert.ok(before.totalBytes > 0);
  assert.equal(before.totalBytes, before.targets.reduce((sum, t) => sum + t.bytes, 0));
  const result = await cleanup.clear();
  assert.equal(result.totalBytes, before.totalBytes);
  assert.deepEqual(result.targets.map((t) => t.id), before.targets.map((t) => t.id));
  assert.equal((await cleanup.sizes()).totalBytes, 0);
});

test("the demo news has a task and three English articles, and needs no file", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  const demo = demoNews(NOW);
  const news = createNews({
    port,
    store,
    file: "news.json",
    dir: DEMO_NEWS_DIR,
    readFile: (path) => (path === "news.json" ? demo.settings : ""),
    writeSecret() {},
    fs: { list: () => demo.entries, read: (path) => demo.contents[path] ?? "", mkdir() {} },
    now: () => NOW,
  });
  const state = await news.get();
  assert.equal(state.articles.length, 3);
  assert.ok(demo.entries.every((entry) => isArticleName(entry.name)));
  assert.deepEqual(state.articles.map((article) => article.date), [...state.articles.map((article) => article.date)].sort().reverse());
  assert.equal(state.task?.id, "news");
  assert.equal(state.task?.lastRunStatus, "succeeded");
  const article = await news.article(state.articles[0]!.date);
  assert.ok(article.markdown.startsWith("# ") && article.markdown.includes("## "));
  assert.equal(article.title, state.articles[0]!.title);
});
