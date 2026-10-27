import assert from "node:assert/strict";
import { test } from "bun:test";
import { DemoPort, demoLinearFetch } from "../../src/app/demo/port.ts";
import { demoFixtures } from "../../src/app/demo/fixtures.ts";
import { issues } from "../../src/integrations/contract.ts";
import { LinearClient } from "../../src/integrations/linear/client.ts";
import { RawConfig, RawProjection, RawProject, RawThread } from "../../src/integrations/t3/schemas.ts";
import { ShellStore } from "../../src/domain/shellStore.ts";
import { toProviders } from "../../src/domain/providers.ts";
import { createActions } from "../../src/domain/actions.ts";
import { createAutomations } from "../../src/domain/automations.ts";
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
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [] }) } });
  const details = await Promise.all(store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, []).threads.map((thread) => actions.threadDetail(thread.id)));
  assert.ok(details.every((detail) => detail.messages.length > 0));
  assert.ok(details.some((detail) => (detail.activity?.items.length ?? 0) > 0 && detail.subagents.length >= 2));
  assert.deepEqual(details.flatMap((detail) => detail.pendingRequests.map((request) => request.category)).sort(), ["approval", "user-input"]);
});

test("a message sent in the demo lands in its thread", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [] }) } });
  const threadId = await actions.createThread({ projectId: "", title: "Try the demo", text: "Hello", modelSelection: { instanceId: "claudeAgent", model: "claude-opus-5-5" } }, []);
  assert.equal(store.thread(threadId)?.title, "Try the demo");
  await actions.sendMessage(threadId, { text: "Second message" }, []);
  const detail = await actions.threadDetail(threadId);
  assert.deepEqual(detail.messages.map((message) => message.text), ["Hello", "Second message"]);
});

test("the demo Linear board and automations need no network", async () => {
  const issuesList = await new LinearClient(demoLinearFetch(NOW)).assignedIssues("demo");
  assert.ok(new Set(issuesList.map((issue) => issue.state.name)).size >= 4);
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const { automations, hiddenThreadIds, setupThreadIds } = await createAutomations({ port, store, dedicated: { read: () => new Set(["demo-digest", "demo-setup"]), add() {} }, createThread: async () => "x" }).list();
  assert.ok(automations.length >= 3 && automations.every((automation) => automation.nextRunAt !== null));
  assert.ok(automations.some((automation) => automation.kind === "reminder"));
  assert.deepEqual(hiddenThreadIds, ["demo-digest"]);
  assert.deepEqual(setupThreadIds, ["demo-setup"]);
  assert.equal(store.thread("demo-setup")?.status, "running");
  const reminder = automations.find((automation) => automation.kind === "reminder")!;
  assert.ok(store.thread(reminder.threadId!), "the reminder is bound to a conversation that stays in the grid");
  await port.deleteScheduledTask(reminder.id);
  const left = await port.listScheduledTasks();
  assert.equal(left.length, automations.length - 1);
  assert.ok(!left.some((task) => task.id === reminder.id));
});

test("demo rename changes the task title and the bound thread, in memory", async () => {
  const port = new DemoPort(() => NOW);
  const store = syncedStore(port);
  await Bun.sleep(0);
  const automations = createAutomations({ port, store, dedicated: { read: () => new Set(), add() {} }, createThread: async () => "x" });
  const reminder = (await automations.list()).automations.find((automation) => automation.kind === "reminder")!;
  await automations.rename(reminder.id, "Ping the team");
  const renamed = (await automations.list()).automations.find((automation) => automation.id === reminder.id)!;
  assert.equal(renamed.kind, "reminder");
  assert.equal(renamed.title, "Ping the team");
  assert.equal(store.thread(reminder.threadId!)?.title, "Ping the team");
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
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [] }) } });
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
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [] }) } });
  const threadId = "demo-dev-server";
  const before = (await actions.threadDetail(threadId)).subagents;
  assert.deepEqual(before.map((s) => [s.status, s.stop]), [["running", "thread"]]);
  await actions.interrupt(threadId);
  await Bun.sleep(0);
  assert.deepEqual((await actions.threadDetail(threadId)).subagents, []);
});
