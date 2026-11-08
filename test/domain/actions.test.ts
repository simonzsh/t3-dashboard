import assert from "node:assert/strict";
import { test } from "bun:test";
import type { BoardResult, DashboardProject } from "../../shared/api.ts";
import { createActions } from "../../src/domain/actions.ts";
import { DomainError } from "../../src/domain/errors.ts";
import type { ShellStore } from "../../src/domain/shellStore.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import { FakePort } from "../helpers/fakePort.ts";
import type { Command, LaunchThread, RawBackgroundTask, RawConfig, RawProjection, T3Port } from "../../src/integrations/t3/schemas.ts";

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
  const store = { thread: () => undefined, project: () => undefined, backgroundTasks: () => tasks, workspaceOf: () => null, projectByRoot: () => undefined };
  let counter = 0;
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: "2026-11-06T12:00:00.000Z", inbox: [], inboxError: null }) }, newId: () => `id-${++counter}` });
  return { actions, commands, port };
}

const delegated = { id: "sub-1", runId: "run-1", status: "running", origin: "app_owned", childThreadId: "child-1" };

function harness({ searchResult = [] as ReturnType<typeof searchMatch>[], searchError = null as Error | null, board = { configured: true, ok: true, error: null, issues: [issue], readAt: "2026-11-06T12:00:00.000Z" } as BoardResult, dispatchError = null as Error | null } = {}) {
  const commands: Command[] = [];
  const launches: LaunchThread[] = [];
  const port: T3Port = {
    threadProjection: async () => ({}),
    usageSummary: async () => ({ buckets: [] }),
    dispatch: async (command) => {
      if (dispatchError) throw dispatchError;
      commands.push(command);
    },
    getConfig: async () => ({}),
    refreshProviders: async () => {},
    listScheduledTasks: async () => [],
    deleteScheduledTask: async () => {},
    updateScheduledTask: async () => {},
    setScheduledTaskWorkspace: async () => {},
    setScheduledTaskEnabled: async () => {},
    runScheduledTaskNow: async () => {},
    subscribeScheduledTasks: () => ({ cancel() {} }),
    createScheduledTask: async (task) => ({ id: task.id }),
    answerSecretRequest: async () => {},
    searchThreads: async () => {
      if (searchError) throw searchError;
      return searchResult;
    },
    fetchAsset: async () => ({ response: new Response(""), fileName: "" }),
    ensureScratchProject: async () => "scratch-project",
    mutateProject: async () => ({ id: "p" }),
    browseFolders: async () => ({ parentPath: "/", entries: [] }),
    pathKinds: async () => [],
    persistAttachments: async () => [],
    turnItem: async () => null,
    searchEntries: async () => ({ entries: [], truncated: false }),
    uploadAttachment: async () => "file-1",
    deleteAttachment: async () => {},
    subscribeShell: () => ({ cancel() {} }),
    launchThread: async (launch) => {
      launches.push(launch);
      return { threadId: launch.threadId };
    },
    listRefs: async () => ({ refs: [], isRepo: true }),
    vcsStatus: async () => ({ isRepo: true }),
    switchRef: async (_cwd, refName) => refName,
    createRef: async (_cwd, refName) => refName,
  };
  const store = {
    thread: (id: string) => (id.startsWith("known") ? ({ id } as ReturnType<ShellStore["thread"]>) : undefined),
    project: (id: string) => (id === "project-1" ? { id, title: "Project", defaultModelSelection: null, icon: null, workspaceRoot: "/work/project" } : undefined),
    backgroundTasks: () => [],
    workspaceOf: () => null,
    projectByRoot: () => undefined,
  };
  let counter = 0;
  const actions = createActions({ port, store, board: { get: async () => board }, newId: () => `id-${++counter}` });
  return { actions, commands, launches };
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

test("assign launches a thread named after the issue, without a generated title", async () => {
  const { actions, commands, launches } = harness();
  const threadId = await actions.assign({ issueId: "issue-1", projectId: "project-1", text: "", modelSelection: { instanceId: "i", model: "m" } }, []);
  assert.deepEqual(commands, []);
  assert.equal(launches[0]?.threadId, threadId);
  assert.equal(launches[0]?.title, "TEAM-1 Fix it");
  assert.equal(launches[0]?.generateTitle, false);
  assert.equal(launches[0]?.initialMessage.text, "Handle Linear issue TEAM-1: https://linear.example/TEAM-1");
});

test("assign passes the workspace and the interaction mode", async () => {
  const { actions, launches } = harness();
  await actions.assign({ issueId: "issue-1", projectId: "project-1", text: "", modelSelection: { instanceId: "i", model: "m" }, workspace: { type: "worktree", baseRef: "main" }, interactionMode: "plan" }, []);
  assert.deepEqual(launches[0]?.workspaceStrategy, { type: "worktree", baseRef: "main" });
  assert.equal(launches[0]?.interactionMode, "plan");
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

const queuedProjection: RawProjection = { runs: [{ id: "run-1", status: "running" }, { id: "q1", status: "queued", userMessageId: "m" }, { id: "done", status: "completed" }] };

test("sending a queued message steers the run the shell reports", async () => {
  const { actions, commands } = stopHarness({ "thread-1": queuedProjection });
  await actions.sendQueued("thread-1", "q1");
  assert.deepEqual(commands.map((c) => [c.type, c.queuedRunId, c.targetRunId]), [["queued-message.promote-to-steer", "q1", "run-1"]]);
});

test("sending a queued message starts it when no run is active", async () => {
  const { actions, commands } = stopHarness({ "thread-1": { runs: [{ id: "q1", status: "queued" }, { id: "old", status: "completed" }] } });
  await actions.sendQueued("thread-1", "q1");
  assert.deepEqual(commands.map((c) => [c.type, c.runId]), [["queued-run.start", "q1"]]);
});

test("a run that is not queued is a conflict and sends no command", async () => {
  const { actions, commands } = stopHarness({ "thread-1": queuedProjection });
  for (const run of ["run-1", "done", "unknown"]) {
    await assert.rejects(actions.sendQueued("thread-1", run), rejectsWith("conflict"));
    await assert.rejects(actions.editQueued("thread-1", run, "x"), rejectsWith("conflict"));
    await assert.rejects(actions.cancelQueued("thread-1", run), rejectsWith("conflict"));
  }
  assert.deepEqual(commands, []);
});

test("editing and removing a queued message send one command each, without attachments", async () => {
  const { actions, commands } = stopHarness({ "thread-1": queuedProjection });
  await actions.editQueued("thread-1", "q1", "new text");
  await actions.cancelQueued("thread-1", "q1");
  assert.deepEqual(commands, [
    { type: "queued-run.edit", threadId: "thread-1", runId: "q1", text: "new text", commandId: "id-1" },
    { type: "queued-run.cancel", threadId: "thread-1", runId: "q1", commandId: "id-2" },
  ]);
});

const repoProject = { id: "repo", title: "Repo", defaultModelSelection: null, icon: null, workspaceRoot: "/work/repo" };

function fakeHarness(workspaces: Record<string, string | null> = {}, projects: Record<string, DashboardProject> = { repo: repoProject, bare: { ...repoProject, id: "bare", workspaceRoot: undefined } }) {
  const port = new FakePort();
  const store = { thread: () => undefined, project: (id: string) => projects[id], backgroundTasks: () => [], workspaceOf: (id: string) => workspaces[id] ?? null, projectByRoot: () => undefined };
  let counter = 0;
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: "2026-11-06T12:00:00.000Z", inbox: [], inboxError: null }) }, newId: () => `id-${++counter}` });
  return { actions, port };
}

test("searchFiles searches the thread's folder and keeps path and kind", async () => {
  const { actions, port } = fakeHarness({ t1: "/work/wt" });
  port.entries = { entries: [{ path: "src", kind: "directory" }, { path: "a.ts", kind: "file" }], truncated: true };
  assert.deepEqual(await actions.searchFiles("t1", "a", 20), { entries: [{ path: "src", kind: "directory" }, { path: "a.ts", kind: "file" }], truncated: true });
  assert.deepEqual(port.entriesCalls, [{ cwd: "/work/wt", query: "a", limit: 20 }]);
});

test("searchFiles is empty, with no T3 call, when no folder is known", async () => {
  const { actions, port } = fakeHarness();
  assert.deepEqual(await actions.searchFiles("t1", "a", 20), { entries: [], truncated: false });
  assert.deepEqual(port.entriesCalls, []);
});

test("stepDetail gives the cut-down detail of the T3 item, not-found when T3 has none", async () => {
  const { actions, port } = fakeHarness();
  port.turnItems.i1 = { id: "i1", type: "file_change", fileName: "a.ts", diffStr: "--- a\n+++ b" };
  assert.equal((await actions.stepDetail("t1", "i1")).diff, "--- a\n+++ b");
  await assert.rejects(actions.stepDetail("t1", "nope"), rejectsWith("not-found"));
});

test("stepDetail of a subagent without a result reads it from the projection", async () => {
  const { actions, port } = fakeHarness();
  port.turnItems.s1 = { id: "s1", type: "subagent", subagentId: "sa" };
  port.projection = { subagents: [{ id: "sa", result: "full result" }] };
  assert.equal((await actions.stepDetail("t1", "s1")).text, "full result");
});

test("uploadAttachment sends the bytes to T3 and answers the ref message.dispatch takes", async () => {
  const { actions, port } = fakeHarness();
  const bytes = new Uint8Array([1, 2, 3]);
  const ref = await actions.uploadAttachment({ type: "file", name: "a.bin", mimeType: "application/octet-stream", sizeBytes: 3, bytes });
  assert.deepEqual(ref, { type: "file", id: "file-1", name: "a.bin", mimeType: "application/octet-stream", sizeBytes: 3 });
  assert.deepEqual(port.fileUploads, [{ type: "file", name: "a.bin", mimeType: "application/octet-stream", sizeBytes: 3, bytes }]);
  await actions.deleteAttachment("file-1");
  assert.deepEqual(port.deletedAttachments, ["file-1"]);
});

test("a message dispatches the persisted images, then the uploads", async () => {
  const { actions, port } = fakeHarness();
  const image = { type: "image" as const, name: "a.png", mimeType: "image/png", sizeBytes: 4, dataUrl: "data:image/png;base64,iVBORw==" };
  const upload = { type: "file" as const, id: "att-1", name: "n.txt", mimeType: "text/plain", sizeBytes: 5 };
  await actions.sendMessage("t1", { text: "x" }, [image], [upload]);
  assert.deepEqual(port.commands[0]!.attachments, [{ type: "image", id: "stored-0", name: "a.png", mimeType: "image/png", sizeBytes: 4 }, upload]);
  await actions.createThread({ projectId: "p", title: "t", text: "x", modelSelection: { instanceId: "i", model: "m" } }, [], [upload]);
  assert.deepEqual(port.launches[0]!.launch.initialMessage.attachments, [upload]);
  assert.deepEqual(port.uploads.length, 1);
});

const rewindable: RawProjection = {
  messages: [{ id: "u1", role: "user", text: "first" }],
  runs: [{ id: "r1", ordinal: 1, status: "completed", userMessageId: "u1" }],
  checkpoints: [{ id: "c0", scopeId: "scope", runId: null, status: "ready", ordinalWithinScope: 0, appRunOrdinal: null }],
};

test("rewind sends the checkpoint before the message, with the revert files choice", async () => {
  const { actions, commands } = stopHarness({ t: rewindable });
  await actions.rewind("t", "u1", true);
  await actions.rewind("t", "u1", false);
  assert.deepEqual(commands, [
    { type: "checkpoint.rollback", threadId: "t", scopeId: "scope", checkpointId: "c0", restoreFiles: true, commandId: "id-1" },
    { type: "checkpoint.rollback", threadId: "t", scopeId: "scope", checkpointId: "c0", restoreFiles: false, commandId: "id-2" },
  ]);
});

test("rewind refuses a message with no rewind point, and a thread with a running run", async () => {
  const { actions, commands } = stopHarness({ t: rewindable, busy: { ...rewindable, runs: [{ id: "r1", ordinal: 1, status: "completed", userMessageId: "u1" }, { id: "r2", ordinal: 2, status: "running", userMessageId: "u2" }] } });
  await assert.rejects(actions.rewind("t", "unknown", false), rejectsWith("conflict"));
  await assert.rejects(actions.rewind("busy", "u1", false), rejectsWith("conflict"));
  assert.deepEqual(commands, []);
});

test("composerCommands reads the provider's commands and the folder's skills from the T3 config", async () => {
  const { actions, port } = fakeHarness({ t1: "/work" });
  port.config = async () => ({
    providers: [{ instanceId: "a", slashCommands: [{ name: "compact" }], workspaceSnapshots: [{ cwd: "/work", slashCommands: [{ name: "compact" }, { name: "local" }], skills: [{ name: "s", path: "/s", enabled: true }] }] }],
  });
  assert.deepEqual(await actions.composerCommands("t1", "a"), {
    commands: [{ name: "compact", description: null }, { name: "local", description: null }],
    skills: [{ name: "s", displayName: null, description: null }],
  });
});

function projectHarness(existing: { id: string; archived: boolean } | undefined = undefined) {
  const port = new FakePort();
  const known = { id: "p1", title: "Atlas", defaultModelSelection: null, icon: null, workspaceRoot: "/home/demo/atlas" };
  const store = { thread: () => undefined, project: (id: string) => (id === "p1" || id === "Atlas" ? known : undefined), backgroundTasks: () => [], workspaceOf: () => null, projectByRoot: (root: string) => (root === "/home/demo/atlas" ? existing : undefined) };
  let counter = 0;
  const actions = createActions({ port, store, board: { get: async () => ({ configured: true, ok: true, error: null, issues: [], readAt: "2026-11-06T12:00:00.000Z", inbox: [], inboxError: null }) }, newId: () => `id-${++counter}`, home: "/home/demo" });
  return { actions, port };
}

test("createProject creates the folder as a project named after it", async () => {
  const { actions, port } = projectHarness();
  assert.deepEqual(await actions.createProject({ path: "~/src/Atlas Web/" }), { projectId: "id-1", created: true });
  assert.deepEqual(port.mutations, [{ mutation: { type: "project.create", projectId: "id-1", title: "Atlas Web", workspaceRoot: "/home/demo/src/Atlas Web", createWorkspaceRootIfMissing: true }, commandId: "id-2" }]);
});

test("createProject uses the typed title, and falls back to 'project' for the root folder", async () => {
  const { actions, port } = projectHarness();
  await actions.createProject({ path: "/x/y", title: "Mine" });
  await actions.createProject({ path: "/" });
  assert.deepEqual(port.mutations.map(({ mutation }) => (mutation as { title: string }).title), ["Mine", "project"]);
});

test("createProject creates nothing when an active project has the folder", async () => {
  const { actions, port } = projectHarness({ id: "old", archived: false });
  assert.deepEqual(await actions.createProject({ path: "~/atlas/../atlas/" }), { projectId: "old", created: false });
  assert.deepEqual(port.mutations, []);
});

test("createProject un-archives the project that has the folder", async () => {
  const { actions, port } = projectHarness({ id: "old", archived: true });
  assert.deepEqual(await actions.createProject({ path: "/home/demo/atlas" }), { projectId: "old", created: false });
  assert.deepEqual(port.mutations, [{ mutation: { type: "project.update", projectId: "old", archived: false }, commandId: "id-1" }]);
});

test("createProject maps T3 refusals to domain errors and re-throws the others", async () => {
  const { actions, port } = projectHarness();
  const refuse = (reason: string) => new IntegrationError("T3 says no", { system: "t3", kind: "refused", reason });
  port.mutateError = refuse("WorkspaceRootNotDirectoryError");
  await assert.rejects(actions.createProject({ path: "/x" }), (e: Error) => e instanceof DomainError && e.code === "invalid" && e.message === "This path is a file, not a folder");
  for (const reason of ["ProjectConflictError", "ProjectAlreadyExistsError"]) {
    port.mutateError = refuse(reason);
    await assert.rejects(actions.createProject({ path: "/x" }), (e: Error) => e instanceof DomainError && e.code === "conflict" && e.message === "Another T3 project already uses this folder");
  }
  const other = refuse("Other");
  port.mutateError = other;
  await assert.rejects(actions.createProject({ path: "/x" }), (e: Error) => e === other);
});

test("updateProject sends only the changed fields", async () => {
  const { actions, port } = projectHarness();
  await actions.updateProject("p1", { title: "Atlas 2", path: "~/src/atlas-2/", icon: { kind: "emoji", emoji: "🚀" } });
  await actions.updateProject("p1", { icon: null });
  assert.deepEqual(port.mutations, [
    { mutation: { type: "project.update", projectId: "p1", title: "Atlas 2", workspaceRoot: "/home/demo/src/atlas-2", projectIcon: { kind: "emoji", emoji: "🚀" } }, commandId: "id-1" },
    { mutation: { type: "project.update", projectId: "p1", projectIcon: null }, commandId: "id-2" },
  ]);
});

test("updateProject sends nothing for the folder it already has", async () => {
  const { actions, port } = projectHarness({ id: "p1", archived: false });
  await actions.updateProject("p1", { path: "/home/demo/atlas/" });
  assert.deepEqual(port.mutations, []);
  await actions.updateProject("p1", { path: "~/atlas", title: "New" });
  assert.deepEqual(port.mutations.map(({ mutation }) => mutation), [{ type: "project.update", projectId: "p1", title: "New" }]);
});

test("updateProject refuses a folder another active project has, and an unknown id", async () => {
  const { actions, port } = projectHarness({ id: "other", archived: false });
  await assert.rejects(actions.updateProject("p1", { path: "/home/demo/atlas" }), (e: Error) => e instanceof DomainError && e.code === "conflict");
  await assert.rejects(actions.updateProject("Atlas", { title: "x" }), (e: Error) => e instanceof DomainError && e.code === "not-found");
  await assert.rejects(actions.updateProject("nope", { title: "x" }), (e: Error) => e instanceof DomainError && e.code === "not-found");
  assert.deepEqual(port.mutations, []);
});

test("updateProject maps T3 refusals to domain errors and re-throws the others", async () => {
  const { actions, port } = projectHarness();
  const refuse = (reason: string) => new IntegrationError("T3 says no", { system: "t3", kind: "refused", reason });
  const cases: Array<[string, string, string]> = [
    ["WorkspaceRootNotExistsError", "invalid", "This folder does not exist"],
    ["WorkspaceRootNotDirectoryError", "invalid", "This path is a file, not a folder"],
    ["ProjectConflictError", "conflict", "Another T3 project already uses this folder"],
    ["ProjectNotFoundError", "not-found", "Project not found"],
  ];
  for (const [reason, code, message] of cases) {
    port.mutateError = refuse(reason);
    await assert.rejects(actions.updateProject("p1", { title: "x" }), (e: Error) => e instanceof DomainError && e.code === code && e.message === message, reason);
  }
  const other = refuse("Other");
  port.mutateError = other;
  await assert.rejects(actions.updateProject("p1", { title: "x" }), (e: Error) => e === other);
});

test("deleteProject sends a forced delete, and refuses an unknown project", async () => {
  const { actions, port } = projectHarness();
  await actions.deleteProject("p1");
  assert.deepEqual(port.mutations, [{ mutation: { type: "project.delete", projectId: "p1", force: true }, commandId: "id-1" }]);
  await assert.rejects(actions.deleteProject("nope"), (e: Error) => e instanceof DomainError && e.code === "not-found");
  port.mutateError = new IntegrationError("gone", { system: "t3", kind: "refused", reason: "ProjectNotFoundError" });
  await assert.rejects(actions.deleteProject("p1"), (e: Error) => e instanceof DomainError && e.code === "not-found");
});

test("projectIcons lists T3's presets in order, each drawable", () => {
  const { actions } = projectHarness();
  const { icons } = actions.projectIcons();
  assert.equal(icons[0]!.name, "folder-code");
  assert.ok(icons.length >= 20);
  assert.ok(icons.every(({ icon }) => icon.kind === "lucide" && icon.shapes.length > 0));
});

test("browseFolders lists visible folders by name, with the kind of the typed path", async () => {
  const { actions, port } = projectHarness();
  port.browseResult = { parentPath: "/home/demo/src", entries: ["b", ".hidden", "a", "C"].map((name) => ({ name, fullPath: `/home/demo/src/${name}` })) };
  port.kinds = [null];
  const result = await actions.browseFolders("~/src/");
  assert.deepEqual(port.browseCalls, ["/home/demo/src/"]);
  assert.deepEqual(result, { path: "/home/demo/src", kind: "missing", entries: ["a", "b", "C"].map((name) => ({ name, path: `/home/demo/src/${name}` })) });
});

test("browseFolders lists the home folder for a bare ~", async () => {
  const { actions, port } = projectHarness();
  port.kinds = ["directory"];
  await actions.browseFolders("~");
  assert.deepEqual(port.browseCalls, ["/home/demo/"]);
});

test("browseFolders keeps hidden folders when the typed segment starts with a dot", async () => {
  const { actions, port } = projectHarness();
  port.browseResult = { parentPath: "/home/demo", entries: [{ name: ".config", fullPath: "/home/demo/.config" }] };
  assert.deepEqual((await actions.browseFolders("~/.c")).entries, [{ name: ".config", path: "/home/demo/.config" }]);
});

test("browseFolders keeps at most 100 folders and maps a file kind", async () => {
  const { actions, port } = projectHarness();
  port.browseResult = { parentPath: "/d", entries: Array.from({ length: 150 }, (_, i) => ({ name: `d${String(i).padStart(3, "0")}`, fullPath: `/d/d${i}` })) };
  port.kinds = ["file"];
  const result = await actions.browseFolders("/d/");
  assert.equal(result.entries.length, 100);
  assert.equal(result.entries[0]!.name, "d000");
  assert.equal(result.kind, "file");
});

test("browseFolders answers no entries when the parent folder is missing, and fails on other errors", async () => {
  const { actions, port } = projectHarness();
  port.browseError = new IntegrationError("no", { system: "t3", kind: "refused", reason: "read_directory_failed" });
  port.kinds = [null];
  assert.deepEqual(await actions.browseFolders("/nope/x"), { path: "/nope/x", kind: "missing", entries: [] });
  port.browseError = new IntegrationError("down", { system: "t3", kind: "unreachable" });
  await assert.rejects(actions.browseFolders("/nope/x"), /down/);
});

const create = { projectId: "repo", title: "Fix the login", text: "Fix it", modelSelection: { instanceId: "i", model: "m" } };

test("createThread launches one thread in the current checkout with a generated title", async () => {
  const { actions, port } = fakeHarness();
  const threadId = await actions.createThread(create, []);
  assert.deepEqual(port.commands, []);
  assert.equal(port.launches.length, 1);
  const { launch, commandId } = port.launches[0]!;
  assert.equal(launch.threadId, threadId);
  assert.notEqual(commandId, threadId);
  assert.deepEqual(launch.workspaceStrategy, { type: "root" });
  assert.equal(launch.generateTitle, true);
  assert.equal(launch.interactionMode, "default");
  assert.deepEqual(port.switches.concat(port.creates), []);
});

test("createThread sends the plan mode and a new worktree strategy", async () => {
  const { actions, port } = fakeHarness();
  await actions.createThread({ ...create, interactionMode: "plan", workspace: { type: "worktree", baseRef: "origin/dev", startFromOrigin: true } }, []);
  assert.equal(port.launches[0]!.launch.interactionMode, "plan");
  assert.deepEqual(port.launches[0]!.launch.workspaceStrategy, { type: "worktree", baseRef: "origin/dev", startFromOrigin: true });
});

test("createThread persists the images, checks the branch out, then launches with the name T3 returned", async () => {
  const { actions, port } = fakeHarness();
  port.switchResult = "dev";
  const image = { type: "image" as const, name: "a.png", mimeType: "image/png", sizeBytes: 4, dataUrl: "data:image/png;base64,iVBORw==" };
  await actions.createThread({ ...create, workspace: { type: "root", branch: "origin/dev" } }, [image]);
  assert.deepEqual(port.log, ["persist", "switch", "launch"]);
  assert.deepEqual(port.switches, [{ cwd: "/work/repo", refName: "origin/dev" }]);
  assert.deepEqual(port.launches[0]!.launch.workspaceStrategy, { type: "root", branch: "dev" });
});

test("createThread asks git for the branch name when T3 returns none", async () => {
  const { actions, port } = fakeHarness();
  port.switchResult = null;
  port.status = { ...port.status, refName: "dev" };
  await actions.createThread({ ...create, workspace: { type: "root", branch: "origin/dev" } }, []);
  assert.deepEqual(port.launches[0]!.launch.workspaceStrategy, { type: "root", branch: "dev" });
});

test("createThread creates a new branch before the launch", async () => {
  const { actions, port } = fakeHarness();
  await actions.createThread({ ...create, workspace: { type: "root", branch: "feature-x", create: true } }, []);
  assert.deepEqual(port.log, ["create", "launch"]);
  assert.deepEqual(port.creates, [{ cwd: "/work/repo", refName: "feature-x" }]);
  assert.deepEqual(port.launches[0]!.launch.workspaceStrategy, { type: "root", branch: "feature-x" });
});

test("createThread launches nothing when the checkout fails", async () => {
  const { actions, port } = fakeHarness();
  port.switchError = new IntegrationError("Your local changes would be overwritten", { system: "t3", kind: "refused" });
  await assert.rejects(actions.createThread({ ...create, workspace: { type: "root", branch: "dev" } }, []), (error: unknown) => error instanceof IntegrationError && error.kind === "refused");
  assert.deepEqual(port.launches, []);
  assert.deepEqual(port.uploads, []);
});

test("createThread reuses the worktree of a branch, and treats the project folder as the current checkout", async () => {
  const { actions, port } = fakeHarness();
  await actions.createThread({ ...create, workspace: { type: "existing_worktree", worktreePath: "/work/wt", branch: "dev" } }, []);
  await actions.createThread({ ...create, workspace: { type: "existing_worktree", worktreePath: "/work/repo", branch: "main" } }, []);
  assert.deepEqual(port.launches.map((entry) => entry.launch.workspaceStrategy), [{ type: "existing_worktree", worktreePath: "/work/wt", branch: "dev" }, { type: "root", branch: "main" }]);
  assert.deepEqual(port.switches, []);
});

test("createThread refuses a branch choice for an unknown project or a project without a folder", async () => {
  const { actions, port } = fakeHarness();
  const workspace = { type: "worktree" as const, baseRef: "main" };
  await assert.rejects(actions.createThread({ ...create, projectId: "nope", workspace }, []), rejectsWith("conflict"));
  await assert.rejects(actions.createThread({ ...create, projectId: "bare", workspace }, []), rejectsWith("conflict"));
  assert.deepEqual(port.launches, []);
});

test("createThread without a project goes to the scratch project in the current checkout", async () => {
  const { actions, port } = fakeHarness();
  await actions.createThread({ ...create, projectId: "" }, []);
  assert.equal(port.launches[0]!.launch.projectId, "scratch-project");
  assert.deepEqual(port.launches[0]!.launch.workspaceStrategy, { type: "root" });
});

test("a T3 older than 0.1 gets a clear conflict and no call", async () => {
  const { actions, port } = fakeHarness();
  port.config = async () => ({ environment: { serverVersion: "0.0.44" } });
  await assert.rejects(actions.createThread(create, []), (error: unknown) => error instanceof DomainError && error.code === "conflict" && /0\.1 or newer/.test(error.message));
  assert.deepEqual(port.launches, []);
  port.config = async () => ({ environment: { serverVersion: "0.1.6" } });
  await actions.createThread(create, []);
  port.config = async () => ({ environment: { serverVersion: "demo" } });
  await actions.createThread(create, []);
  assert.equal(port.launches.length, 2);
});

test("a T3 failure while launching is a T3 error", async () => {
  const { actions, port } = fakeHarness();
  port.launchError = new Error("T3 down");
  await assert.rejects(actions.createThread(create, []), (error: unknown) => error instanceof IntegrationError && error.message === "T3 down");
});

test("projectRefs maps T3's refs, asks for a page of 100 and passes the query and cursor", async () => {
  const { actions, port } = fakeHarness();
  port.refs = {
    refs: [
      { name: "main", current: true, isDefault: true, worktreePath: "/work/repo" },
      { name: "origin/dev", isRemote: true, remoteName: "origin", current: false, isDefault: false, worktreePath: null },
      { name: "bare" },
    ],
    isRepo: true,
    hasPrimaryRemote: true,
    nextCursor: 100,
    totalCount: 230,
  };
  assert.deepEqual(await actions.projectRefs("repo", { query: "d", cursor: 0 }), {
    isRepo: true,
    hasPrimaryRemote: true,
    refs: [
      { name: "main", remote: false, current: true, isDefault: true, worktreePath: "/work/repo" },
      { name: "origin/dev", remote: true, remoteName: "origin", current: false, isDefault: false, worktreePath: null },
      { name: "bare", remote: false, current: false, isDefault: false, worktreePath: null },
    ],
    nextCursor: 100,
    totalCount: 230,
  });
  assert.deepEqual(port.refCalls, [{ cwd: "/work/repo", limit: 100, query: "d", cursor: 0 }]);
});

test("projectRefs and projectVcsStatus answer isRepo false for a folder that is not a repository", async () => {
  const { actions, port } = fakeHarness();
  port.refs = { refs: [], isRepo: false };
  port.status = { isRepo: false };
  assert.deepEqual(await actions.projectRefs("repo", {}), { isRepo: false, hasPrimaryRemote: false, refs: [], nextCursor: null, totalCount: 0 });
  assert.deepEqual(await actions.projectVcsStatus("repo"), { isRepo: false, hasPrimaryRemote: false, branch: null, hasChanges: false });
});

test("projectRefs lets a T3 failure through", async () => {
  const { actions, port } = fakeHarness();
  port.refsError = new IntegrationError("down", { system: "t3", kind: "unreachable" });
  await assert.rejects(actions.projectRefs("repo", {}), (error: unknown) => error instanceof IntegrationError && error.kind === "unreachable");
});

test("projectVcsStatus gives the branch and whether the tree is dirty", async () => {
  const { actions, port } = fakeHarness();
  port.status = { isRepo: true, hasPrimaryRemote: true, refName: "dev", hasWorkingTreeChanges: true };
  assert.deepEqual(await actions.projectVcsStatus("repo"), { isRepo: true, hasPrimaryRemote: true, branch: "dev", hasChanges: true });
  assert.deepEqual(port.statusCalls, ["/work/repo"]);
});

test("projectRefs and projectVcsStatus refuse an unknown project, and a project without a folder", async () => {
  const { actions } = fakeHarness();
  await assert.rejects(actions.projectRefs("nope", {}), rejectsWith("not-found"));
  await assert.rejects(actions.projectVcsStatus("nope"), rejectsWith("not-found"));
  await assert.rejects(actions.projectRefs("bare", {}), rejectsWith("conflict"));
  await assert.rejects(actions.projectVcsStatus("bare"), rejectsWith("conflict"));
});
