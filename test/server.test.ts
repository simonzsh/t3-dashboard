import assert from "node:assert/strict";
import { afterEach, test } from "bun:test";
import type { AutomationsResult, ConnectionStatus, DashboardState } from "../shared/api.ts";
import { LinearBoard } from "../src/linear.ts";
import { readLinearWorkspaces } from "../src/linearConfig.ts";
import type { LinearWorkspaceConfig } from "../src/linearConfig.ts";
import { createSettings } from "../src/settings.ts";
import { createDashboardServer } from "../src/server.ts";
import type { DashboardHandler } from "../src/server.ts";
import type { Site } from "../src/site.ts";
import { UpdateManager } from "../src/updates.ts";
import { ShellStore } from "../src/shellStore.ts";
import { SseHub } from "../src/sse.ts";
import { VERSION } from "../src/version.ts";
import type { Command, ImageUpload, RawConfig, RawProjection, ShellItem, T3Port } from "../src/t3/types.ts";

const now = new Date("2026-03-20T12:00:00.000Z");
const connection: ConnectionStatus = { t3: "live", origin: "http://127.0.0.1:3773", serverVersion: "1.0.0", protocolMismatch: false, error: null, since: "x", setup: null };

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
  uploads: Array<{ threadId: string; messageId: string; images: ImageUpload[] }> = [];
  async persistAttachments(threadId: string, messageId: string, images: ImageUpload[]) {
    this.uploads.push({ threadId, messageId, images });
    return images.map((image, index) => ({ type: "image", id: `stored-${index}`, name: image.name, mimeType: image.mimeType, sizeBytes: image.sizeBytes }));
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
  // Content of the Linear file. Without it, `workspaces` feeds the board directly.
  linear?: unknown;
  pasteResult?: "ok" | "rejected" | "unreachable" | "locked";
  update?: { unavailable?: string | null; tag?: string };
}

const LINEAR_FILE = "/cfg/linear.json";

async function start(startOptions: StartOptions = {}) {
  const { site = { serve: async () => null }, workspaces = [], linearFetch, automations = () => ({ automations: [], brains: [], fetchedAt: now.toISOString() }) } = startOptions;
  const linearCalls: string[] = [];
  const files: Record<string, string> = startOptions.linear === undefined ? {} : { [LINEAR_FILE]: JSON.stringify(startOptions.linear) };
  const readFile = (path: string) => {
    if (path in files) return files[path]!;
    throw new Error("ENOENT");
  };
  const board = new LinearBoard({
    fetch: async (url, init) => {
      linearCalls.push(String(new Headers(init.headers).get("authorization")));
      return linearFetch ? linearFetch(url, init) : new Response(JSON.stringify({ data: { viewer: { assignedIssues: { nodes: [linearNode(1)] } } } }));
    },
    readWorkspaces: () => (startOptions.linear === undefined ? workspaces : readLinearWorkspaces(LINEAR_FILE, readFile)),
    now: () => now,
  });
  const settings = createSettings({
    file: LINEAR_FILE,
    configDir: "/cfg",
    readFile,
    writeSecret: (path, text) => {
      files[path] = text;
    },
    board,
    tokenSource: () => "issued",
  });
  const setupCalls: string[] = [];
  const setup = {
    refresh: async () => void setupCalls.push("refresh"),
    paste: async (token: string) => {
      setupCalls.push(`paste:${token}`);
      return startOptions.pasteResult ?? "ok";
    },
    wake: () => void setupCalls.push("wake"),
  };
  const updateRuns: string[] = [];
  const updates = new UpdateManager({
    version: "1.0.0",
    unavailable: startOptions.update?.unavailable ?? null,
    latestTag: async () => startOptions.update?.tag ?? "v1.1.0",
    // Never ends: a second apply must see the update still running.
    run: () => (updateRuns.push("run"), new Promise<boolean>(() => {})),
    now: () => now.getTime(),
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
  const getState = (): DashboardState => store.state(connection, [], true);
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
    settings,
    setup,
    updates,
    newId: () => `id-${++counter}`,
  });
  running.push(async () => hub.close());
  return { port, store, hub, server, linearCalls, files, setupCalls, updateRuns };
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
  assert.deepEqual(health.json, { ok: true, t3: "live", version: VERSION });
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

test("messages: steer falls back to the running run of the projection", async () => {
  const { server, port } = await start();
  port.projection = { runs: [{ id: "r1", status: "completed" }, { id: "r2", status: "running" }] };
  assert.equal((await post(server, "/api/threads/run-2/messages", { text: "Hi", mode: "steer" })).status, 200);
  assert.deepEqual(port.commands[0]!.dispatchMode, { type: "steer_active", targetRunId: "r2" });
});

// 4 bytes of PNG data in base64.
const png = { name: "shot.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw==" };

test("messages: images are persisted first, then referenced under the same message id", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "Look", attachments: [png] })).status, 200);
  assert.deepEqual(port.uploads, [{ threadId: "idle-1", messageId: "id-1", images: [{ type: "image", ...png, sizeBytes: 4 }] }]);
  assert.equal(port.commands[0]!.messageId, "id-1");
  assert.deepEqual(port.commands[0]!.attachments, [{ type: "image", id: "stored-0", name: "shot.png", mimeType: "image/png", sizeBytes: 4 }]);
});

test("messages: attachments must be a few PNG, JPEG, GIF or WebP data URLs", async () => {
  const { server, port } = await start();
  const bad = [
    "x",
    [{ ...png, mimeType: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA" }],
    [{ ...png, dataUrl: "data:image/jpeg;base64,AAAA" }],
    [{ ...png, dataUrl: "data:image/png;base64,not base64!" }],
    [{ ...png, name: "" }],
    Array.from({ length: 11 }, () => png),
  ];
  for (const attachments of bad) assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "x", attachments })).status, 400, JSON.stringify(attachments).slice(0, 80));
  assert.deepEqual([port.uploads, port.commands], [[], []]);
});

test("messages: the body may exceed 1 MB for images, up to 25 MB", async () => {
  const { server } = await start();
  const big = { text: "x", attachments: [{ ...png, dataUrl: `data:image/png;base64,${"A".repeat(2_000_000)}` }] };
  assert.equal((await post(server, "/api/threads/idle-1/messages", big)).status, 200);
  assert.equal((await call(server, "POST", "/api/threads/idle-1/messages", { raw: "x".repeat(26 * 1024 * 1024), headers: { "content-type": "application/json" } })).status, 413);
});

test("settings: model selection and runtime mode become T3 commands", async () => {
  const { server, port } = await start();
  const selection = { ...model, options: [{ id: "effort", value: "high" }] };
  assert.deepEqual((await post(server, "/api/threads/idle-1/settings", { modelSelection: selection, runtimeMode: "auto" })).json, { ok: true });
  assert.deepEqual(port.commands, [
    { type: "thread.model-selection.set", commandId: "id-1", threadId: "idle-1", modelSelection: selection },
    { type: "thread.runtime-mode.set", commandId: "id-2", threadId: "idle-1", runtimeMode: "auto" },
  ]);
});

test("settings: needs a valid model selection or runtime mode", async () => {
  const { server, port } = await start();
  const bad = [{}, { runtimeMode: "yolo" }, { modelSelection: { instanceId: "", model: "m" } }, { modelSelection: model, runtimeMode: 3 }];
  for (const body of bad) assert.equal((await post(server, "/api/threads/idle-1/settings", body)).status, 400, JSON.stringify(body));
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

test("GET /api/threads/:id shows the shell's pending background tasks as running subagents", async () => {
  const { server, store } = await start();
  store.apply([{ kind: "thread.updated", thread: { id: "idle-1", projectId: "project-1", status: "completed", pendingBackgroundTasks: [{ taskId: "t1", description: "Explore" }] } }]);
  const detail = (await call(server, "GET", "/api/threads/idle-1")).json;
  assert.deepEqual(detail.subagents.map((s: { title: string; status: string }) => [s.title, s.status]), [["Explore", "running"]]);
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
  assert.equal((await call(server, "POST", "/api/threads/idle-1/archive", { raw: "x".repeat(1_100_000), headers: { "content-type": "application/json" } })).status, 413);
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

const space = (name: string): LinearWorkspaceConfig => ({ name, apiKey: "key-1" });
const assignBody = { workspace: "Space 1", issueId: "issue-1", agent: "claude", projectId: "project-1" };
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
  assert.deepEqual(first.json.workspaces, [{ name: "Space 1", ok: true, error: null }]);
  assert.deepEqual(first.json.issues.map((issue: { identifier: string; workspace: string }) => [issue.identifier, issue.workspace]), [["TEAM-1", "Space 1"]]);
  await call(server, "GET", "/api/board");
  assert.equal(linearCalls.length, 1);
  await call(server, "GET", "/api/board?refresh=1");
  assert.equal(linearCalls.length, 2);
  assert.ok(!first.text.includes("key-1"));
});

test("POST /api/board/assign with claude creates a thread in the chosen project", async () => {
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

test("assign finds the project by title as well as by id", async () => {
  const { server, port } = await start({ workspaces: [space("Space 1")] });
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, projectId: "Project B" })).status, 200);
  assert.equal(port.commands[0]!.projectId, "project-2");
});

test("assign errors: 400 invalid body or no project, 404 unknown workspace or issue, 409 unknown T3 project", async () => {
  const { server, port } = await start({ workspaces: [space("Space 1")] });
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, agent: "other" })).status, 400);
  assert.equal((await post(server, "/api/board/assign", { workspace: "Space 1" })).status, 400);
  const { projectId: _projectId, ...withoutProject } = assignBody;
  assert.equal((await post(server, "/api/board/assign", withoutProject)).status, 400);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, projectId: " " })).status, 400);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, workspace: "Nope" })).status, 404);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, issueId: "nope" })).status, 404);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, projectId: "missing" })).status, 409);
  assert.deepEqual(port.commands, []);
});

test("the board shows the issues of every team", async () => {
  const teamNode = (n: number, key: string) => ({ ...linearNode(n), team: { key, name: `Team ${key}` } });
  const nodes = [teamNode(1, "ENG"), teamNode(2, "OPS"), teamNode(3, "HR")];
  const { server } = await start({ workspaces: [space("Linear")], linearFetch: async () => new Response(JSON.stringify({ data: { viewer: { assignedIssues: { nodes } } } })) });
  const board = await call(server, "GET", "/api/board");
  assert.deepEqual(board.json.issues.map((issue: { id: string }) => issue.id), ["issue-1", "issue-2", "issue-3"]);
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

const KEY = "lin_api_secretkey_ABCD";
const viewerOk = async () => new Response(JSON.stringify({ data: { viewer: { id: "u1" } } }));

test("GET /api/settings reports the Linear state without the key", async () => {
  const { server } = await start({ linear: { apiKey: KEY, teams: { TEAM: "Project A" } } });
  const reply = await call(server, "GET", "/api/settings");
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, {
    linear: { connected: true, keyTail: "ABCD", legacy: false },
    t3: { tokenSource: "issued" },
    configDir: "/cfg",
  });
  assert.ok(!reply.text.includes(KEY));
});

test("POST /api/settings/linear/key verifies the key, writes it and refreshes the board", async () => {
  const { server, files, linearCalls } = await start({ linear: {}, linearFetch: viewerOk });
  const reply = await post(server, "/api/settings/linear/key", { apiKey: ` ${KEY} ` });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json.linear, { connected: true, keyTail: "ABCD", legacy: false });
  assert.ok(!reply.text.includes(KEY));
  assert.deepEqual(linearCalls, [KEY]);
  assert.deepEqual(JSON.parse(files["/cfg/linear.json"]!), { apiKey: KEY });
});

test("a key Linear refuses is not written, and the error holds no key", async () => {
  const { server, files } = await start({ linearFetch: async () => new Response("denied", { status: 401 }) });
  const reply = await post(server, "/api/settings/linear/key", { apiKey: KEY });
  assert.equal(reply.status, 400);
  assert.deepEqual(reply.json, { error: "Linear refused this key." });
  assert.deepEqual(files, {});
});

test("an unreachable Linear gives 502, and an empty key gives 400", async () => {
  const down = await start({
    linearFetch: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual((await post(down.server, "/api/settings/linear/key", { apiKey: KEY })).json, { error: "Linear is unreachable." });
  assert.equal((await post(down.server, "/api/settings/linear/key", { apiKey: KEY })).status, 502);
  assert.equal((await post(down.server, "/api/settings/linear/key", { apiKey: "" })).status, 400);
  assert.deepEqual(down.files, {});
});

test("saving a key makes the board show its issues right away", async () => {
  const { server } = await start({ linear: {} });
  const before = await call(server, "GET", "/api/board");
  assert.deepEqual([before.json.configured, before.json.issues.length], [false, 0]);
  await post(server, "/api/settings/linear/key", { apiKey: KEY });
  const after = await call(server, "GET", "/api/board");
  assert.deepEqual([after.json.configured, after.json.issues.length], [true, 1]);
  assert.ok(!after.text.includes(KEY));
});

test("disconnect empties the key and nothing else stays", async () => {
  const { server, files } = await start({ linear: { apiKey: KEY, teams: { TEAM: "Project A" }, unlisted: "hide" } });
  const reply = await post(server, "/api/settings/linear/disconnect");
  assert.equal(reply.json.linear.connected, false);
  assert.deepEqual(JSON.parse(files["/cfg/linear.json"]!), { apiKey: "" });
});

test("the Linear teams routes are gone", async () => {
  const { server } = await start({ linear: { apiKey: KEY } });
  assert.equal((await call(server, "GET", "/api/settings/linear/teams")).status, 404);
  assert.equal((await post(server, "/api/settings/linear/teams", { teams: {}, unlisted: "show" })).status, 404);
});

test("settings routes keep the origin check, the content type and the security headers", async () => {
  const { server } = await start({ linear: {} });
  assert.equal((await call(server, "GET", "/api/settings", { headers: { host: "evil.example" } })).status, 403);
  assert.equal((await post(server, "/api/settings/linear/key", { apiKey: KEY }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(server, "POST", "/api/settings/linear/key", { raw: "{}", headers: { "content-type": "text/plain" } })).status, 400);
  assert.equal((await call(server, "GET", "/api/settings")).headers["x-frame-options"], "DENY");
});

test("POST /api/setup/retry resolves the token again, wakes the sync and returns the status", async () => {
  const { server, setupCalls } = await start();
  const reply = await post(server, "/api/setup/retry");
  assert.equal(reply.status, 200);
  assert.equal(reply.json.t3, "live");
  assert.deepEqual(setupCalls, ["refresh", "wake"]);
});

test("POST /api/setup/token stores an accepted token and never echoes it", async () => {
  const { server, setupCalls } = await start();
  const reply = await post(server, "/api/setup/token", { token: "pasted-token-value" });
  assert.equal(reply.status, 200);
  assert.ok(!reply.text.includes("pasted-token-value"));
  assert.deepEqual(setupCalls, ["paste:pasted-token-value", "wake"]);
});

test("a token T3 refuses gives 400, an unreachable T3 gives 502, an empty one gives 400", async () => {
  const refused = await start({ pasteResult: "rejected" });
  const reply = await post(refused.server, "/api/setup/token", { token: "pasted-token-value" });
  assert.deepEqual([reply.status, reply.json], [400, { error: "T3 Code refused this token." }]);
  assert.ok(!refused.setupCalls.includes("wake"));
  const down = await start({ pasteResult: "unreachable" });
  const second = await post(down.server, "/api/setup/token", { token: "pasted-token-value" });
  assert.deepEqual([second.status, second.json], [502, { error: "T3 Code is unreachable." }]);
  assert.equal((await post(down.server, "/api/setup/token", { token: "  " })).status, 400);
});

test("a pasted token is refused with 409 when the token file variable is set", async () => {
  const { server, setupCalls } = await start({ pasteResult: "locked" });
  const reply = await post(server, "/api/setup/token", { token: "pasted-token-value" });
  assert.deepEqual([reply.status, reply.json], [409, { error: "T3_DASHBOARD_TOKEN_FILE is set: put the token in that file." }]);
  assert.ok(!setupCalls.includes("wake"));
});

test("GET /api/update reports the state, POST /api/update/check asks for the latest release", async () => {
  const { server } = await start();
  const before = (await call(server, "GET", "/api/update")).json;
  assert.equal(before.current, "1.0.0");
  assert.equal(before.latest, null);
  const checked = await post(server, "/api/update/check");
  assert.equal(checked.status, 200);
  assert.equal(checked.json.latest, "1.1.0");
  assert.equal(checked.json.available, true);
  assert.equal(checked.json.checkedAt, now.toISOString());
  assert.deepEqual((await call(server, "GET", "/api/update")).json, checked.json);
});

test("POST /api/update/apply answers 202 at once and starts the update", async () => {
  const { server, updateRuns } = await start();
  const reply = await post(server, "/api/update/apply");
  assert.equal(reply.status, 202);
  assert.equal(reply.json.updating, true);
  assert.deepEqual(updateRuns, ["run"]);
  const again = await post(server, "/api/update/apply");
  assert.equal(again.status, 409);
});

test("POST /api/update/apply answers 409 when this build cannot update", async () => {
  const { server, updateRuns } = await start({ update: { unavailable: "Development build." } });
  const reply = await post(server, "/api/update/apply");
  assert.equal(reply.status, 409);
  assert.deepEqual(reply.json, { error: "Development build." });
  assert.deepEqual(updateRuns, []);
});

test("update routes keep the origin check and the content type", async () => {
  const { server, updateRuns } = await start();
  assert.equal((await post(server, "/api/update/apply", {}, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call(server, "POST", "/api/update/apply", { raw: "{}", headers: { "content-type": "text/plain" } })).status, 400);
  assert.equal((await call(server, "GET", "/api/update", { headers: { host: "evil.example" } })).status, 403);
  assert.deepEqual(updateRuns, []);
});
