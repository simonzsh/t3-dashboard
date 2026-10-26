import assert from "node:assert/strict";
import { test } from "bun:test";
import type { BoardResult } from "../../shared/api.ts";
import { createActions } from "../../src/domain/actions.ts";
import { DomainError } from "../../src/domain/errors.ts";
import type { ShellStore } from "../../src/domain/shellStore.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { Command, RawBackgroundTask, RawConfig, RawProjection, T3Port } from "../../src/integrations/t3/schemas.ts";

const issue = {
  id: "issue-1",
  identifier: "TEAM-1",
  title: "Fix it",
  url: "https://linear.example/TEAM-1",
  state: { name: "Todo", type: "unstarted", color: "#ccc" },
  priority: 2,
  priorityLabel: "High",
  project: null,
  team: { key: "TEAM", name: "Team" },
  updatedAt: "2026-03-20T10:00:00.000Z",
};

const searchMatch = (threadId: string) => ({ threadId, projectId: "project-1", source: "user" as const, snippet: `hit in ${threadId}`, messageCreatedAt: null });

function stopHarness(projections: Record<string, RawProjection>, config: RawConfig = {}, tasks: RawBackgroundTask[] = []) {
  const commands: Command[] = [];
  const port = {
    threadProjection: async (id: string) => projections[id] ?? {},
    dispatch: async (command: Command) => void commands.push(command),
    getConfig: async () => config,
  } as unknown as T3Port;
  const store = { thread: () => undefined, project: () => undefined, backgroundTasks: () => tasks };
  let counter = 0;
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [] }) }, newId: () => `id-${++counter}` });
  return { actions, commands, port };
}

const delegated = { id: "sub-1", runId: "run-1", status: "running", origin: "app_owned", childThreadId: "child-1" };

function harness({ searchResult = [] as ReturnType<typeof searchMatch>[], searchError = null as Error | null, board = { configured: true, ok: true, error: null, issues: [issue] } as BoardResult, dispatchError = null as Error | null } = {}) {
  const commands: Command[] = [];
  const port: T3Port = {
    threadProjection: async () => ({}),
    dispatch: async (command) => {
      if (dispatchError) throw dispatchError;
      commands.push(command);
    },
    getConfig: async () => ({}),
    searchThreads: async () => {
      if (searchError) throw searchError;
      return searchResult;
    },
    fetchAsset: async () => ({ response: new Response(""), fileName: "" }),
    ensureScratchProject: async () => "scratch-project",
    persistAttachments: async () => [],
    subscribeShell: () => ({ cancel() {} }),
  };
  const store = {
    thread: (id: string) => (id.startsWith("known") ? ({ id } as ReturnType<ShellStore["thread"]>) : undefined),
    project: (id: string) => (id === "project-1" ? { id, title: "Project", defaultModelSelection: null, icon: null } : undefined),
    backgroundTasks: () => [],
  };
  let counter = 0;
  const actions = createActions({ port, store, board: { get: async () => board }, newId: () => `id-${++counter}` });
  return { actions, commands };
}

const rejectsWith = (code: string) => (error: unknown) => error instanceof DomainError && error.code === code;

test("interrupt without an active run is a conflict and sends nothing", async () => {
  const { actions, commands } = harness();
  await assert.rejects(actions.interrupt("thread-1"), rejectsWith("conflict"));
  assert.deepEqual(commands, []);
});

test("interrupt without an active run stops the thread when T3 can", async () => {
  const { actions, commands } = stopHarness({ "thread-1": {} }, { environment: { capabilities: { threadStop: true } } });
  await actions.interrupt("thread-1");
  assert.deepEqual(commands, [{ type: "thread.stop", threadId: "thread-1", commandId: "id-1" }]);
});

test("interrupt without an active run nor threadStop interrupts the last run while background tasks wait", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { runs: [{ id: "r1", status: "completed" }, { id: "r2", status: "completed" }] } }, {}, [{ description: "Shell job" }]);
  await actions.interrupt("thread-1");
  assert.deepEqual(commands, [{ type: "run.interrupt", threadId: "thread-1", runId: "r2", holdQueue: true, commandId: "id-1" }]);
});

test("interrupt without an active run, threadStop or background tasks is a conflict", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { runs: [{ id: "r1", status: "completed" }] } });
  await assert.rejects(actions.interrupt("thread-1"), rejectsWith("conflict"));
  assert.deepEqual(commands, []);
});

test("a T3 failure of any kind comes back as a T3 integration error with its message", async () => {
  const { actions } = harness({ dispatchError: new Error("T3 down") });
  await assert.rejects(actions.dismiss("thread-1", "request-1"), (error: unknown) => error instanceof IntegrationError && error.system === "t3" && error.message === "T3 down");
});

test("assign names the thread after the issue and asks the agent to handle it", async () => {
  const { actions, commands } = harness();
  const threadId = await actions.assign({ issueId: "issue-1", projectId: "project-1", text: "", modelSelection: { instanceId: "i", model: "m" } }, []);
  const create = commands.find((command) => command.type === "thread.create");
  assert.equal(create?.threadId, threadId);
  assert.equal(create?.title, "TEAM-1 Fix it");
  const message = commands.find((command) => command.type === "message.dispatch");
  assert.equal(message?.text, "Traite le ticket Linear TEAM-1 : https://linear.example/TEAM-1");
});

test("assign refuses an unknown issue and an unknown project", async () => {
  const { actions } = harness();
  await assert.rejects(actions.assign({ issueId: "nope", projectId: "project-1", text: "", modelSelection: { instanceId: "i", model: "m" } }, []), rejectsWith("not-found"));
  await assert.rejects(actions.assign({ issueId: "issue-1", projectId: "nope", text: "", modelSelection: { instanceId: "i", model: "m" } }, []), rejectsWith("conflict"));
});

test("search drops matches of threads the dashboard does not list and keeps T3's order", async () => {
  const { actions } = harness({ searchResult: [searchMatch("known-b"), searchMatch("gone"), searchMatch("known-a")] });
  const { matches } = await actions.searchThreads("hit", 5);
  assert.deepEqual(matches.map((match) => match.threadId), ["known-b", "known-a"]);
});

test("a T3 search failure comes back as a T3 integration error", async () => {
  const { actions } = harness({ searchError: new Error("search down") });
  await assert.rejects(actions.searchThreads("hit"), (error: unknown) => error instanceof IntegrationError && error.system === "t3" && error.message === "search down");
});

test("stopSubagent of a native subagent sends only subagent.stop", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { subagents: [{ id: "sub-1", runId: "run-1", status: "running", origin: "provider_native" }] } });
  await actions.stopSubagent("thread-1", "sub-1");
  assert.deepEqual(commands, [{ type: "subagent.stop", threadId: "thread-1", runId: "run-1", subagentId: "sub-1", commandId: "id-1" }]);
});

test("stopSubagent of a delegated task then stops the child thread when T3 can", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { subagents: [delegated] } }, { environment: { capabilities: { threadStop: true } } });
  await actions.stopSubagent("thread-1", "sub-1");
  assert.deepEqual(commands.map((c) => [c.type, c.threadId]), [["subagent.stop", "thread-1"], ["thread.stop", "child-1"]]);
});

test("stopSubagent without threadStop interrupts the active run of the child", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { subagents: [delegated] }, "child-1": { runs: [{ id: "c1", status: "completed" }, { id: "c2", status: "running" }] } });
  await actions.stopSubagent("thread-1", "sub-1");
  assert.deepEqual(commands[1], { type: "run.interrupt", threadId: "child-1", runId: "c2", holdQueue: true, commandId: "id-2" });
});

test("stopSubagent skips the child interrupt when the child has no active run", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { subagents: [delegated] }, "child-1": { runs: [{ id: "c1", status: "completed" }] } });
  await actions.stopSubagent("thread-1", "sub-1");
  assert.deepEqual(commands.map((c) => c.type), ["subagent.stop"]);
});

test("stopSubagent still stops the child thread when T3 refuses subagent.stop", async () => {
  const { actions, commands, port } = stopHarness({ "thread-1": { subagents: [delegated] } }, { environment: { capabilities: { threadStop: true } } });
  const dispatch = port.dispatch.bind(port);
  port.dispatch = async (command) => (command.type === "subagent.stop" ? Promise.reject(new Error("refused")) : dispatch(command));
  await actions.stopSubagent("thread-1", "sub-1");
  assert.deepEqual(commands.map((c) => c.type), ["thread.stop"]);
});

test("stopSubagent refuses an unknown, finished or run-less subagent and sends nothing", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { subagents: [{ id: "done", runId: "run-1", status: "completed", completedAt: "2026-03-01T10:00:00Z" }, { id: "no-run", status: "running" }] } });
  await assert.rejects(actions.stopSubagent("thread-1", "missing"), rejectsWith("not-found"));
  await assert.rejects(actions.stopSubagent("thread-1", "done"), rejectsWith("conflict"));
  await assert.rejects(actions.stopSubagent("thread-1", "no-run"), rejectsWith("conflict"));
  assert.deepEqual(commands, []);
});
