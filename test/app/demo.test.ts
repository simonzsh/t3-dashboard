import assert from "node:assert/strict";
import { test } from "bun:test";
import { DemoPort, demoLinearFetch } from "../../src/app/demo/port.ts";
import { demoAutomations, demoFixtures } from "../../src/app/demo/fixtures.ts";
import { issues } from "../../src/integrations/contract.ts";
import { LinearClient } from "../../src/integrations/linear/client.ts";
import { RawConfig, RawProjection, RawProject, RawThread } from "../../src/integrations/t3/schemas.ts";
import { ShellStore } from "../../src/domain/shellStore.ts";
import { toProviders } from "../../src/domain/providers.ts";
import { createActions } from "../../src/domain/actions.ts";
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
  const state = store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, [], true);
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
  const details = await Promise.all(store.state({ t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null }, [], true).threads.map((thread) => actions.threadDetail(thread.id)));
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
  const { automations, brains } = demoAutomations(NOW);
  assert.ok(automations.length >= 3 && automations.every((automation) => automation.nextRunAt !== null));
  assert.ok(brains.every((brain) => brain.ok));
});
