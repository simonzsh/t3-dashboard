import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { request } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, test } from "node:test";
import type { ConnectionStatus, DashboardState } from "../shared/api.ts";
import { createDashboardServer } from "../src/server.ts";
import { ShellStore } from "../src/shellStore.ts";
import { SseHub } from "../src/sse.ts";
import type { Command, RawProjection, ShellItem, T3Port } from "../src/t3/types.ts";

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
  async getConfig() {
    return {};
  }
  subscribeShell() {
    return { cancel() {} };
  }
}

const running = [] as Array<() => Promise<void>>;
afterEach(async () => {
  for (const stop of running.splice(0)) await stop();
});

async function start(staticDir?: string) {
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
        projects: [{ id: "project-1", title: "Project A" }],
      },
    },
    { kind: "synchronized" },
  ]);
  const server = createDashboardServer({
    port,
    store,
    hub,
    getState,
    connection: () => connection,
    staticDir: staticDir ?? join(tmpdir(), "t3-dashboard-missing-dir"),
    newId: () => `id-${++counter}`,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  running.push(async () => {
    hub.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return { port, store, hub, server, origin: (server.address() as AddressInfo).port };
}

interface Reply {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  text: string;
  json: any;
}

function call(server: Server, method: string, path: string, options: { headers?: Record<string, string>; body?: unknown; raw?: string } = {}): Promise<Reply> {
  const { port } = server.address() as AddressInfo;
  const payload = options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body));
  const headers = { ...(options.body !== undefined ? { "content-type": "application/json" } : {}), ...options.headers };
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, method, path, headers }, (res) => {
      let text = "";
      res.on("data", (chunk) => (text += chunk));
      res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, text, json: text.startsWith("{") || text.startsWith("[") ? JSON.parse(text) : null }));
    });
    req.on("error", reject);
    req.end(payload);
  });
}

const post = (server: Server, path: string, body: unknown = {}, headers?: Record<string, string>) => call(server, "POST", path, { body, ...(headers && { headers }) });
const model = { instanceId: "provider-a", model: "model-x" };

test("GET /api/health and /api/state", async () => {
  const { server } = await start();
  const health = await call(server, "GET", "/api/health");
  assert.deepEqual(health.json, { ok: true, t3: "live" });
  assert.equal(health.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(health.headers["access-control-allow-origin"], undefined);
  const state = (await call(server, "GET", "/api/state")).json as DashboardState;
  assert.equal(state.connection.t3, "live");
  assert.deepEqual(state.projects, [{ id: "project-1", title: "Project A", defaultModelSelection: null }]);
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
  const { server } = await start(staticDirWith({ "index.html": "<html></html>" }));
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
  const { port } = server.address() as AddressInfo;
  const received = await new Promise<string>((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path: "/api/events" }, (res) => {
      assert.equal(res.headers["content-type"], "text/event-stream");
      let text = "";
      res.on("data", (chunk) => {
        text += chunk;
        if (text.startsWith("event: state\n") && !text.includes("event: threads")) {
          store.apply([{ kind: "thread.updated", thread: { id: "new-1", title: "Thread 9", status: "idle", createdAt: "2026-03-05T00:00:00Z" } } satisfies ShellItem]);
        }
        if (text.includes("event: threads\n")) {
          req.destroy();
          resolve(text);
        }
      });
    });
    req.on("error", (error) => (error as NodeJS.ErrnoException).code === "ECONNRESET" || reject(error));
    req.end();
  });
  assert.match(received, /^event: state\ndata: \{/);
  assert.match(received, /event: threads\ndata: \{"upserted":\[\{"id":"new-1"/);
});

function staticDirWith(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "t3-dashboard-static-"));
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

test("static: a missing build answers a short page", async () => {
  const { server } = await start();
  const reply = await call(server, "GET", "/");
  assert.equal(reply.status, 200);
  assert.match(String(reply.headers["content-type"]), /text\/html/);
  assert.match(reply.text, /npm run build/);
});

test("static: files, content types and SPA fallback", async () => {
  const dir = staticDirWith({ "index.html": "<p>app</p>", "assets/app.js": "console.log(1)", "assets/app.css": "a{}", "icon.svg": "<svg/>" });
  const { server } = await start(dir);
  assert.equal((await call(server, "GET", "/")).text, "<p>app</p>");
  const js = await call(server, "GET", "/assets/app.js");
  assert.equal(js.text, "console.log(1)");
  assert.match(String(js.headers["content-type"]), /text\/javascript/);
  assert.match(String((await call(server, "GET", "/assets/app.css")).headers["content-type"]), /text\/css/);
  assert.match(String((await call(server, "GET", "/icon.svg")).headers["content-type"]), /image\/svg\+xml/);
  assert.equal((await call(server, "GET", "/some/client/route")).text, "<p>app</p>");
});

test("static: traversal is blocked", async () => {
  const dir = staticDirWith({ "web/dist/index.html": "<p>app</p>", "secret.txt": "top secret" });
  const { server } = await start(join(dir, "web", "dist"));
  for (const path of ["/%2e%2e/%2e%2e/secret.txt", "/..%2f..%2fsecret.txt", "/%2e%2e%2f%2e%2e%2fsecret.txt", "/%00"]) {
    const reply = await call(server, "GET", path);
    assert.ok(!reply.text.includes("top secret"), path);
  }
});
