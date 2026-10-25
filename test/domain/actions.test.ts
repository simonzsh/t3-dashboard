import assert from "node:assert/strict";
import { test } from "bun:test";
import type { BoardResult } from "../../shared/api.ts";
import { createActions } from "../../src/domain/actions.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { Command, T3Port } from "../../src/integrations/t3/schemas.ts";

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
  workspace: "Main",
  updatedAt: "2026-03-20T10:00:00.000Z",
};

function harness({ board = { workspaces: [{ name: "Main", ok: true, error: null }], issues: [issue], configured: true } as BoardResult, dispatchError = null as Error | null } = {}) {
  const commands: Command[] = [];
  const port: T3Port = {
    threadProjection: async () => ({}),
    dispatch: async (command) => {
      if (dispatchError) throw dispatchError;
      commands.push(command);
    },
    getConfig: async () => ({}),
    persistAttachments: async () => [],
    subscribeShell: () => ({ cancel() {} }),
  };
  const store = {
    thread: () => undefined,
    project: (id: string) => (id === "project-1" ? { id, title: "Project", defaultModelSelection: null } : undefined),
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

test("a T3 failure of any kind comes back as a T3 integration error with its message", async () => {
  const { actions } = harness({ dispatchError: new Error("T3 down") });
  await assert.rejects(actions.dismiss("thread-1", "request-1"), (error: unknown) => error instanceof IntegrationError && error.system === "t3" && error.message === "T3 down");
});

test("assign names the thread after the issue and asks the agent to handle it", async () => {
  const { actions, commands } = harness();
  const threadId = await actions.assign({ workspace: "Main", issueId: "issue-1", agent: "claude", projectId: "project-1" });
  const create = commands.find((command) => command.type === "thread.create");
  assert.equal(create?.threadId, threadId);
  assert.equal(create?.title, "TEAM-1 Fix it");
  const message = commands.find((command) => command.type === "message.dispatch");
  assert.equal(message?.text, "Traite le ticket Linear TEAM-1 : https://linear.example/TEAM-1");
});

test("assign refuses an unknown workspace, an unknown issue and an unknown project", async () => {
  const { actions } = harness();
  await assert.rejects(actions.assign({ workspace: "Other", issueId: "issue-1", agent: "claude", projectId: "project-1" }), rejectsWith("not-found"));
  await assert.rejects(actions.assign({ workspace: "Main", issueId: "nope", agent: "claude", projectId: "project-1" }), rejectsWith("not-found"));
  await assert.rejects(actions.assign({ workspace: "Main", issueId: "issue-1", agent: "claude", projectId: "nope" }), rejectsWith("conflict"));
});
