import assert from "node:assert/strict";
import { afterEach, test } from "bun:test";
import type { AutomationsResult, ConnectionStatus, DashboardState } from "../shared/api.ts";
import { LinearBoard } from "../src/linear.ts";
import type { LinearWorkspaceConfig } from "../src/linearConfig.ts";
import { createDashboardServer } from "../src/server.ts";
import type { DashboardHandler } from "../src/server.ts";
import type { Site } from "../src/site.ts";
import { ShellStore } from "../src/shellStore.ts";
import { SseHub } from "../src/sse.ts";
import type { Command, RawConfig, RawProjection, ShellItem, T3Port } from "../src/t3/types.ts";

const now = new Date("2026-03-20T12:00:00.000Z");
const connection: ConnectionStatus = { t3: "live", origin: "http://127.0.0.1:3773", serverVersion: "1.0.0", protocolMismatch: false, error: null, since: "x" };

class FakePort implements T3Port {
  commands: Command[] = [];
  projection: RawProjection = {};
  dispatchError: Error | null = null;
  projectionError: Error | null = null;
  async threadProjection(): Promise<RawProjection> {
    if (this.projectionError) throw this.projectionError;
    return this.projection;
  }
  async dispatch(command: Command) {
    if (this.dispatchError) throw this.dispatchError;
    this.commands.push(command);
    return { sequence: 1 };
  }
  config: RawConfig = {};
  async getConfig() {
    return this.config;
  }
  subscribeShell() {
    return { cancel() {} };
  }
}

const running = [] as Array<() => Promise<void>>;
afterEach(async () => {
  for (const stop of running.splice(0)) await stop();
});

const linearNode = (n: number) => ({
  id: `issue-${n}`,
  identifier: `TEAM-${n}`,
  title: `Issue ${n}`,
  url: `https://linear.example/TEAM-${n}`,
  priority: 2,
  priorityLabel: "High",
  updatedAt: "2026-03-20T10:00:00.000Z",
  state: { name: "Todo", type: "unstarted", color: "#ccc" },
  project: null,
  team: { key: "TEAM", name: "Team 1" },
});

interface StartOptions {
  site?: Site;
  workspaces?: LinearWorkspaceConfig[];
  linearFetch?: (url: string, init: RequestInit) => Promise<Response>;
  automations?: () => AutomationsResult;
}

async function start(startOptions: StartOptions = {}) {
  const { site = { serve: async () => null }, workspaces = [], linearFetch, automations = () => ({ automations: [], brains: [], fetchedAt: now.toISOString() }) } = startOptions;
  const linearCalls: string[] = [];
  const board = new LinearBoard({
    fetch: async (url, init) => {
      linearCalls.push(String(new Headers(init.headers).get("authorization")));
      return linearFetch ? linearFetch(url, init) : new Response(JSON.stringify({ data: { viewer: { assignedIssues: { nodes: [linearNode(1)] } } } }));
    },
    readWorkspaces: () => workspaces,
    resolveProject: (title) => store.project(title)?.id ?? null,
    now: () => now,
  });
  const port = new FakePort();
  const hub = new SseHub({ batchMs: 10, pingMs: 60_000 });
  let counter = 0;
  const store: ShellStore = new ShellStore({
    now: () => now,
    onState: () => hub.broadcast({ type: "state", data: getState() }),
    onThreads: (diff) => hub.broadcast({ type: "threads", data: diff }),
    onProjects: (diff) => hub.broadcast({ type: "projects", data: diff }),
  });
  const getState = (): DashboardState => store.state(connection, []);
  store.beginSync();
  store.apply([
    {
      kind: "snapshot",
      snapshot: {
        threads: [
          { id: "idle-1", projectId: "project-1", title: "Thread 1", status: "idle", createdAt: "2026-03-01T00:00:00Z" },
          { id: "run-1", projectId: "project-1", title: "Thread 2", status: "running", activeRunId: "run-a", createdAt: "2026-03-02T00:00:00Z" },
          { id: "run-2", projectId: "project-1", title: "Thread 3", status: "running", activeRunId: null, createdAt: "2026-03-03T00:00:00Z" },
        ],
        projects: [{ id: "project-1", title: "Project A" }, { id: "project-2", title: "Project B" }],
      },
    },
    { kind: "synchronized" },
  ]);
  const server: DashboardHandler = createDashboardServer({
    port,
    store,
    hub,
    board,
    automations,
    getState,
    connection: () => connection,
    site,
    newId: () => `id-${++counter}`,
  });
  running.push(async () => hub.close());
  return { port, store, hub, server, linearCalls };
}

interface Reply {
  status: number;
  headers: Record<string, string>;
  text: string;
  json: any;
}

async function call(server: DashboardHandler, method: string, path: string, options: { headers?: Record<string, string>; body?: unknown; raw?: string } = {}): Promise<Reply> {
  const payload = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const headers = { host: "127.0.0.1", ...(options.body !== undefined ? { "content-type": "application/json" } : {}), ...options.headers };
  const res = await server.fetch(new Request(`http://127.0.0.1${path}`, { method, headers, body: payload }));
  const text = await res.text();
  return { status: res.status, headers: Object.fromEntries(res.headers), text, json: text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : null };
}

const post = (server: DashboardHandler, path: string, body: unknown = {}, headers?: Record<string, string>) => call(server, "POST", path, { body, ...(headers && { headers }) });
const model = { instanceId: "provider-a", model: "model-x" };

test("GET /api/health and /api/state", async () => {
  const { server } = await start();
  const health = await call(server, "GET", "/api/health");
  assert.deepEqual(health.json, { ok: true, t3: "live" });
  assert.equal(health.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(health.headers["access-control-allow-origin"], undefined);
  const state = (await call(server, "GET", "/api/state")).json as DashboardState;
  assert.equal(state.connection.t3, "live");
  assert.deepEqual(state.projects, [
    { id: "project-1", title: "Project A", defaultModelSelection: null },
    { id: "project-2", title: "Project B", defaultModelSelection: null },
  ]);
  assert.equal(state.threads.length, 3);
});

test("POST /api/threads sends thread.create then message.dispatch", async () => {
  const { server, port } = await start();
  const reply = await post(server, "/api/threads", { projectId: " project-1 ", title: " Thread 4 ", text: "Hello", modelSelection: model });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true, threadId: "id-1" });
  assert.deepEqual(
    port.commands.map((command) => command.type),
    ["thread.create", "message.dispatch"],
  );
  assert.equal(port.commands[0]!.projectId, "project-1");
  assert.equal(port.commands[0]!.title, "Thread 4");
  assert.equal(port.commands[0]!.runtimeMode, "full-access");
  assert.deepEqual(port.commands[1]!.dispatchMode, { type: "start_immediately" });
  assert.equal(port.commands[1]!.text, "Hello");
});

test("POST /api/threads validates its body", async () => {
  const { server, port } = await start();
  const bad = [
    { title: "t", text: "x", modelSelection: model },
    { projectId: "p", title: "  ", text: "x", modelSelection: model },
    { projectId: "p", title: "t", text: "", modelSelection: model },
    { projectId: "p", title: "t", text: "x" },
    { projectId: "p", title: "t", text: "x", modelSelection: { instanceId: "", model: "m" } },
    { projectId: "p", title: "t", text: "x", modelSelection: { instanceId: "i", model: 3 } },
  ];
  for (const body of bad) assert.equal((await post(server, "/api/threads", body)).status, 400, JSON.stringify(body));
  assert.deepEqual(port.commands, []);
});

test("messages: idle or unknown thread starts immediately", async () => {
  const { server, port } = await start();
  assert.deepEqual((await post(server, "/api/threads/idle-1/messages", { text: "Hi", mode: "steer" })).json, { ok: true });
  assert.deepEqual(port.commands[0]!.dispatchMode, { type: "start_immediately" });
  await post(server, "/api/threads/unknown/messages", { text: "Hi" });
  assert.deepEqual(port.commands[1]!.dispatchMode, { type: "start_immediately" });
  assert.equal(port.commands[0]!.threadId, "idle-1");
});

test("messages: active thread queues by default and steers on request", async () => {
  const { server, port } = await start();
  await post(server, "/api/threads/run-1/messages", { text: "Hi" });
  await post(server, "/api/threads/run-1/messages", { text: "Hi", mode: "queue" });
  await post(server, "/api/threads/run-1/messages", { text: "Hi", mode: "steer" });
  assert.deepEqual(
    port.commands.map((command) => command.dispatchMode),
    [{ type: "queue_after_active" }, { type: "queue_after_active" }, { type: "steer_active", targetRunId: "run-a" }],
  );
});

test("messages: steer without an active run id gives 409; bad input gives 400", async () => {
  const { server, port } = await start();
  const steer = await post(server, "/api/threads/run-2/messages", { text: "Hi", mode: "steer" });
  assert.equal(steer.status, 409);
  assert.ok(steer.json.error);
  assert.equal((await post(server, "/api/threads/run-1/messages", { text: "  " })).status, 400);
  assert.equal((await post(server, "/api/threads/run-1/messages", { text: "x", mode: "restart" })).status, 400);
  assert.deepEqual(port.commands, []);
});

test("interrupt uses the store active run id with holdQueue", async () => {
  const { server, port } = await start();
  assert.deepEqual((await post(server, "/api/threads/run-1/interrupt")).json, { ok: true });
  assert.deepEqual(port.commands[0], { type: "run.interrupt", commandId: "id-1", threadId: "run-1", runId: "run-a", holdQueue: true });
});

test("interrupt falls back to the last active run of the projection, else 409", async () => {
  const { server, port } = await start();
  port.projection = { runs: [{ id: "r1", status: "running" }, { id: "r2", status: "completed" }, { id: "r3", status: "waiting" }, { id: "r4", status: "failed" }] };
  assert.equal((await post(server, "/api/threads/run-2/interrupt")).status, 200);
  assert.equal(port.commands[0]!.runId, "r3");
  port.projection = { runs: [{ id: "r1", status: "completed" }] };
  assert.equal((await post(server, "/api/threads/idle-1/interrupt")).status, 409);
  assert.equal(port.commands.length, 1);
});

test("archive, pin and unpin", async () => {
  const { server, port } = await start();
  for (const action of ["archive", "pin", "unpin"]) assert.deepEqual((await post(server, `/api/threads/idle-1/${action}`)).json, { ok: true });
  assert.deepEqual(
    port.commands.map((command) => [command.type, command.threadId]),
    [["thread.archive", "idle-1"], ["thread.pin", "idle-1"], ["thread.unpin", "idle-1"]],
  );
});

test("every response forbids framing and sniffing", async () => {
  const { server } = await start({ site: { serve: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }) } });
  for (const reply of [await call(server, "GET", "/api/state"), await call(server, "GET", "/"), await post(server, "/api/threads/x/nope")]) {
    assert.equal(reply.headers["x-frame-options"], "DENY");
    assert.equal(reply.headers["content-security-policy"], "frame-ancestors 'none'");
    assert.equal(reply.headers["x-content-type-options"], "nosniff");
  }
});

test("prototype keys are not thread actions", async () => {
  const { server, port } = await start();
  for (const action of ["constructor", "toString"]) assert.equal((await post(server, `/api/threads/idle-1/${action}`)).status, 404);
  assert.deepEqual(port.commands, []);
});

test("respond: decisions and answers", async () => {
  const { server, port } = await start();
  const path = "/api/threads/run-1/requests/req-1/respond";
  for (const decision of ["accept", "acceptForSession", "decline"]) assert.equal((await post(server, path, { decision })).status, 200);
  assert.equal((await post(server, path, { answers: { q1: "a", q2: ["b", "c"] } })).status, 200);
  assert.deepEqual(port.commands[2], { type: "runtime-request.respond", commandId: "id-3", threadId: "run-1", requestId: "req-1", decision: "decline" });
  assert.deepEqual(port.commands[3], { type: "runtime-request.respond", commandId: "id-4", threadId: "run-1", requestId: "req-1", answers: { q1: "a", q2: ["b", "c"] } });
});

test("respond rejects acceptAlways, cancel, both keys, neither key and bad answers", async () => {
  const { server, port } = await start();
  const path = "/api/threads/run-1/requests/req-1/respond";
  const bad = [{ decision: "acceptAlways" }, { decision: "cancel" }, { decision: "accept", answers: {} }, {}, { answers: "x" }, { answers: [] }, { answers: { q: 3 } }, { answers: { q: [1] } }];
  for (const body of bad) assert.equal((await post(server, path, body)).status, 400, JSON.stringify(body));
  assert.deepEqual(port.commands, []);
});

test("dismiss", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/threads/run-1/requests/req%201/dismiss")).status, 200);
  assert.deepEqual(port.commands[0], { type: "thread.user-input.dismiss", commandId: "id-1", threadId: "run-1", requestId: "req 1" });
});

test("GET /api/threads/:id joins the projection and the store thread", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m1", role: "user", text: "Hello" }], visibleTurnItems: [{ item: { messageId: "m1" } }] };
  const detail = (await call(server, "GET", "/api/threads/run-1")).json;
  assert.equal(detail.threadId, "run-1");
  assert.equal(detail.thread.title, "Thread 2");
  assert.equal(detail.messages[0].text, "Hello");
  assert.equal((await call(server, "GET", "/api/threads/nope")).json.thread, null);
});

test("a T3 failure gives 502 with its message", async () => {
  const { server, port } = await start();
  port.dispatchError = new Error("thread.archive: no such thread");
  const reply = await post(server, "/api/threads/idle-1/archive");
  assert.equal(reply.status, 502);
  assert.match(reply.json.error, /no such thread/);
  port.projectionError = new Error("T3 answered 500");
  assert.equal((await call(server, "GET", "/api/threads/idle-1")).status, 502);
});

test("guards: Host, Origin, content-type, JSON, size", async () => {
  const { server, port } = await start();
  assert.equal((await call(server, "GET", "/api/health", { headers: { host: "evil.example" } })).status, 403);
  assert.equal((await call(server, "GET", "/api/health", { headers: { host: "localhost:5173" } })).status, 200);
  assert.equal((await call(server, "GET", "/api/health", { headers: { origin: "http://evil.example" } })).status, 403);
  assert.equal((await call(server, "GET", "/api/health", { headers: { origin: "null" } })).status, 403);
  assert.equal((await call(server, "GET", "/api/health", { headers: { origin: "http://localhost:5173" } })).status, 200);
  assert.equal((await call(server, "GET", "/api/health", { headers: { origin: "http://127.0.0.1:5173" } })).status, 200);
  assert.equal((await post(server, "/api/threads/idle-1/archive", {}, { origin: "http://evil.example" })).status, 403);
  assert.equal((await call(server, "POST", "/api/threads/idle-1/archive", { headers: { "content-type": "text/plain" }, raw: "{}" })).status, 400);
  assert.equal((await call(server, "POST", "/api/threads/idle-1/archive", { raw: "{}" })).status, 400);
  assert.equal((await call(server, "POST", "/api/threads/idle-1/archive", { raw: "{not json" })).status, 400);
  assert.equal((await call(server, "POST", "/api/threads/idle-1/messages", { raw: "x".repeat(1_100_000), headers: { "content-type": "application/json" } })).status, 413);
  assert.deepEqual(port.commands, []);
});

test("unknown API routes give 404 and never CORS headers", async () => {
  const { server } = await start();
  const reply = await call(server, "GET", "/api/nope");
  assert.equal(reply.status, 404);
  assert.ok(reply.json.error);
  assert.equal((await post(server, "/api/nope")).status, 404);
  assert.equal((await call(server, "GET", "/api/threads/idle-1/archive")).status, 404);
  assert.equal(reply.headers["access-control-allow-origin"], undefined);
});

test("SSE: first frame is state, then a store diff arrives", async () => {
  const { server, store } = await start();
  const live = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: (req, bunServer) => server.fetch(req, bunServer) });
  const controller = new AbortController();
  try {
    const res = await fetch(`http://127.0.0.1:${live.port}/api/events`, { signal: controller.signal });
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
    let text = "";
    while (!text.includes("event: threads\n")) {
      const { value, done } = await reader.read();
      assert.ok(!done, "stream ended early");
      text += value;
      if (text.startsWith("event: state\n") && !text.includes("event: threads")) {
        store.apply([{ kind: "thread.updated", thread: { id: "new-1", title: "Thread 9", status: "idle", createdAt: "2026-03-05T00:00:00Z" } } satisfies ShellItem]);
      }
    }
    assert.match(text, /^event: state\ndata: \{/);
    assert.match(text, /event: threads\ndata: \{"upserted":\[\{"id":"new-1"/);
  } finally {
    controller.abort();
    await live.stop(true);
  }
});

test("a site page is served for GET and never for other methods", async () => {
  const { server } = await start({ site: { serve: async (pathname) => (pathname === "/" ? new Response("<p>app</p>") : null) } });
  assert.equal((await call(server, "GET", "/")).text, "<p>app</p>");
  assert.equal((await call(server, "GET", "/missing.js")).status, 404);
  assert.equal((await post(server, "/")).status, 404);
});

const space = (name: string, t3Project = "Project A", teams: Record<string, string> | null = null): LinearWorkspaceConfig => ({ name, apiKey: "key-1", t3Project, teams });
const assignBody = { workspace: "Space 1", issueId: "issue-1", agent: "claude" };
const providers: RawConfig = {
  providers: [
    { instanceId: "provider-b", enabled: true, status: "ready", models: [{ slug: "model-y" }] },
    { instanceId: "codex", enabled: true, status: "ready", models: [{ slug: "model-c1" }, { slug: "model-c2" }] },
  ],
};

test("GET /api/board returns the board and caches it until ?refresh=1", async () => {
  const { server, linearCalls } = await start({ workspaces: [space("Space 1")] });
  const first = await call(server, "GET", "/api/board");
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.workspaces, [{ name: "Space 1", ok: true, error: null, t3ProjectId: "project-1" }]);
  assert.deepEqual(first.json.issues.map((issue: { identifier: string; workspace: string }) => [issue.identifier, issue.workspace]), [["TEAM-1", "Space 1"]]);
  await call(server, "GET", "/api/board");
  assert.equal(linearCalls.length, 1);
  await call(server, "GET", "/api/board?refresh=1");
  assert.equal(linearCalls.length, 2);
  assert.ok(!first.text.includes("key-1"));
});

test("POST /api/board/assign with claude creates a thread in the workspace project", async () => {
  const { server, port } = await start({ workspaces: [space("Space 1")] });
  const reply = await post(server, "/api/board/assign", assignBody);
  assert.deepEqual(reply.json, { ok: true, threadId: "id-1" });
  assert.deepEqual(
    port.commands.map((command) => command.type),
    ["thread.create", "message.dispatch"],
  );
  assert.equal(port.commands[0]!.projectId, "project-1");
  assert.equal(port.commands[0]!.title, "TEAM-1 Issue 1");
  assert.equal(port.commands[1]!.text, "Traite le ticket Linear TEAM-1 : https://linear.example/TEAM-1");
  assert.deepEqual(port.commands[0]!.modelSelection, { instanceId: "claudeAgent", model: "claude-opus-5-5" });
});

test("assign with claude keeps the project default when it uses claudeAgent", async () => {
  const { server, port, store } = await start({ workspaces: [space("Space 1")] });
  store.apply([{ kind: "project.updated", project: { id: "project-1", title: "Project A", defaultModelSelection: { instanceId: "claudeAgent", model: "model-d" } } }]);
  await post(server, "/api/board/assign", assignBody);
  assert.deepEqual(port.commands[0]!.modelSelection, { instanceId: "claudeAgent", model: "model-d" });
});

test("assign with claude ignores a project default on another provider", async () => {
  const { server, port, store } = await start({ workspaces: [space("Space 1")] });
  store.apply([{ kind: "project.updated", project: { id: "project-1", title: "Project A", defaultModelSelection: { instanceId: "codex", model: "model-d" } } }]);
  await post(server, "/api/board/assign", assignBody);
  assert.deepEqual(port.commands[0]!.modelSelection, { instanceId: "claudeAgent", model: "claude-opus-5-5" });
});

test("assign with codex uses the first model of the codex provider", async () => {
  const { server, port } = await start({ workspaces: [space("Space 1")] });
  port.config = providers;
  const reply = await post(server, "/api/board/assign", { ...assignBody, agent: "codex" });
  assert.equal(reply.status, 200);
  assert.deepEqual(port.commands[0]!.modelSelection, { instanceId: "codex", model: "model-c1" });
});

test("assign with codex answers 409 when no codex model exists", async () => {
  const { server, port } = await start({ workspaces: [space("Space 1")] });
  port.config = { providers: [providers.providers![0]!] };
  const reply = await post(server, "/api/board/assign", { ...assignBody, agent: "codex" });
  assert.equal(reply.status, 409);
  assert.deepEqual(port.commands, []);
});

test("assign finds the project by id as well as by title", async () => {
  const { server, port } = await start({ workspaces: [space("Space 1", "project-1")] });
  assert.equal((await post(server, "/api/board/assign", assignBody)).status, 200);
  assert.equal(port.commands[0]!.projectId, "project-1");
});

test("assign errors: 400 invalid body, 404 unknown workspace or issue, 409 unknown T3 project", async () => {
  const { server, port } = await start({ workspaces: [space("Space 1"), space("Space 2", "Missing")] });
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, agent: "other" })).status, 400);
  assert.equal((await post(server, "/api/board/assign", { workspace: "Space 1" })).status, 400);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, workspace: "Nope" })).status, 404);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, issueId: "nope" })).status, 404);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, workspace: "Space 2" })).status, 409);
  assert.deepEqual(port.commands, []);
});

test("a team table routes each ticket to its own project and hides other teams", async () => {
  const teamNode = (n: number, key: string) => ({ ...linearNode(n), team: { key, name: `Team ${key}` } });
  const nodes = [teamNode(1, "ENG"), teamNode(2, "OPS"), teamNode(3, "HR")];
  const { server, port } = await start({
    workspaces: [{ name: "Linear", apiKey: "key-1", t3Project: "", teams: { ENG: "Project A", OPS: "Project B" } }],
    linearFetch: async () => new Response(JSON.stringify({ data: { viewer: { assignedIssues: { nodes } } } })),
  });
  const board = await call(server, "GET", "/api/board");
  assert.deepEqual(board.json.issues.map((issue: { id: string; t3ProjectId: string }) => [issue.id, issue.t3ProjectId]), [["issue-1", "project-1"], ["issue-2", "project-2"]]);
  const body = { workspace: "Linear", agent: "claude" };
  assert.equal((await post(server, "/api/board/assign", { ...body, issueId: "issue-2" })).status, 200);
  assert.equal(port.commands[0]!.projectId, "project-2");
  assert.equal((await post(server, "/api/board/assign", { ...body, issueId: "issue-3" })).status, 404);
  assert.equal(port.commands.length, 2);
});

test("assign answers 409 when the issue team maps to a missing T3 project", async () => {
  const { server, port } = await start({ workspaces: [{ name: "Linear", apiKey: "key-1", t3Project: "", teams: { TEAM: "Missing" } }] });
  assert.equal((await post(server, "/api/board/assign", { workspace: "Linear", issueId: "issue-1", agent: "claude" })).status, 409);
  assert.deepEqual(port.commands, []);
});

test("assign rereads Linear once when the issue is not in the cached board", async () => {
  let nodes = [linearNode(1)];
  const { server, linearCalls } = await start({
    workspaces: [space("Space 1")],
    linearFetch: async () => new Response(JSON.stringify({ data: { viewer: { assignedIssues: { nodes } } } })),
  });
  await call(server, "GET", "/api/board");
  nodes = [linearNode(1), linearNode(2)];
  const reply = await post(server, "/api/board/assign", { ...assignBody, issueId: "issue-2" });
  assert.equal(reply.status, 200);
  assert.equal(linearCalls.length, 2);
});

test("assign answers 502 when Linear fails and when T3 fails", async () => {
  const down = await start({ workspaces: [space("Space 1")], linearFetch: async () => new Response("no", { status: 500 }) });
  const linear = await post(down.server, "/api/board/assign", assignBody);
  assert.equal(linear.status, 502);
  assert.ok(!linear.text.includes("key-1"));
  const { server, port } = await start({ workspaces: [space("Space 1")] });
  port.dispatchError = new Error("T3 down");
  assert.equal((await post(server, "/api/board/assign", assignBody)).status, 502);
});

test("GET /api/automations returns the automations read at each call", async () => {
  let calls = 0;
  const result: AutomationsResult = { automations: [], brains: [{ name: "Brain A", ok: true, error: null, problems: 1 }], fetchedAt: now.toISOString() };
  const { server } = await start({ automations: () => (calls++, result) });
  const first = await call(server, "GET", "/api/automations");
  assert.equal(first.status, 200);
  assert.deepEqual(first.json, result);
  await call(server, "GET", "/api/automations");
  assert.equal(calls, 2);
});
