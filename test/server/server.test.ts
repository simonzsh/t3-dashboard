import assert from "node:assert/strict";
import { afterEach, test } from "bun:test";
import type { AutomationsResult, ConnectionStatus, DashboardState } from "../../shared/api.ts";
import { LinearClient } from "../../src/integrations/linear/client.ts";
import { createActions } from "../../src/domain/actions.ts";
import type { Automations } from "../../src/domain/automations.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { LinearBoard } from "../../src/domain/linearBoard.ts";
import { readLinearKey } from "../../src/config/linearFile.ts";
import { createSettings } from "../../src/domain/settings.ts";
import { createDashboardServer } from "../../src/server/server.ts";
import type { DashboardHandler } from "../../src/server/server.ts";
import type { Site } from "../../src/server/site.ts";
import { UpdateManager } from "../../src/domain/updates.ts";
import { ShellStore } from "../../src/domain/shellStore.ts";
import { SseHub } from "../../src/server/sse.ts";
import { VERSION } from "../../src/config/version.ts";
import { FakePort } from "../helpers/fakePort.ts";
import { linearNode, linearPage } from "../helpers/linear.ts";
import type { RawConfig, ShellItem } from "../../src/integrations/t3/schemas.ts";

const now = new Date("2026-03-20T12:00:00.000Z");
const connection: ConnectionStatus = { t3: "live", serverVersion: "1.0.0", protocolMismatch: false, error: null, setup: null };

const running = [] as Array<() => Promise<void>>;
afterEach(async () => {
  for (const stop of running.splice(0)) await stop();
});

interface StartOptions {
  site?: Site;
  linearKey?: string;
  linearFetch?: (url: string, init: RequestInit) => Promise<Response>;
  automations?: Pick<Automations, "list" | "request" | "remove" | "rename">;
  // Content of the Linear file. Without it, `linearKey` feeds the board directly.
  linear?: unknown;
  pasteResult?: "ok" | "rejected" | "unreachable" | "locked";
  update?: { unavailable?: string | null; tag?: string };
  allowedHosts?: string[];
}

const LINEAR_FILE = "/cfg/linear.json";

async function start(startOptions: StartOptions = {}) {
  const { site = { serve: async () => null }, linearKey = "", linearFetch, automations = { list: async () => ({ automations: [], hiddenThreadIds: [], setupThreadIds: [] }), request: async () => "thread-x", remove: async () => {}, rename: async () => {} } } = startOptions;
  const linearCalls: string[] = [];
  const files: Record<string, string> = startOptions.linear === undefined ? {} : { [LINEAR_FILE]: JSON.stringify(startOptions.linear) };
  const readFile = (path: string) => {
    if (path in files) return files[path]!;
    throw new Error("ENOENT");
  };
  const board = new LinearBoard({
    client: new LinearClient(async (url, init) => {
      linearCalls.push(String(new Headers(init.headers).get("authorization")));
      return linearFetch ? linearFetch(url, init) : linearPage([linearNode(1)]);
    }),
    readKey: () => (startOptions.linear === undefined ? linearKey : readLinearKey(LINEAR_FILE, readFile)),
    now: () => now,
  });
  const settings = createSettings({
    file: LINEAR_FILE,
    readFile,
    writeSecret: (path, text) => {
      files[path] = text;
    },
    board,
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
  const actions = createActions({ port, store, board, newId: () => `id-${++counter}` });
  const server: DashboardHandler = createDashboardServer({
    actions,
    hub,
    board,
    automations,
    getState,
    connection: () => connection,
    site,
    settings,
    setup,
    updates,
    allowedHosts: startOptions.allowedHosts,
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

test("GET /api/health", async () => {
  const { server } = await start();
  const health = await call(server, "GET", "/api/health");
  assert.deepEqual(health.json, { ok: true, t3: "live", version: VERSION });
  assert.equal(health.headers["content-type"], "application/json; charset=utf-8");
  assert.equal(health.headers["access-control-allow-origin"], undefined);
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
    { projectId: 3, title: "t", text: "x", modelSelection: model },
    { projectId: "p", title: "  ", text: "x", modelSelection: model },
    { projectId: "p", title: "t", text: "", modelSelection: model },
    { projectId: "p", title: "t", text: "x" },
    { projectId: "p", title: "t", text: "x", modelSelection: { instanceId: "", model: "m" } },
    { projectId: "p", title: "t", text: "x", modelSelection: { instanceId: "i", model: 3 } },
  ];
  for (const body of bad) assert.equal((await post(server, "/api/threads", body)).status, 400, JSON.stringify(body));
  assert.deepEqual(port.commands, []);
});

test("POST /api/threads without a project goes to T3's No project", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/threads", { title: "t", text: "x", modelSelection: model })).status, 200);
  assert.equal((port.commands[0] as { projectId?: string }).projectId, "scratch-project");
});

test("POST /api/threads takes a runtime mode and images in one call", async () => {
  const { server, port } = await start();
  const selection = { ...model, options: [{ id: "effort", value: "high" }] };
  const image = { name: "shot.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw==" };
  const reply = await post(server, "/api/threads", { projectId: "project-1", title: "Look", text: "Look at this", modelSelection: selection, runtimeMode: "auto", attachments: [image] });
  assert.deepEqual(reply.json, { ok: true, threadId: "id-1" });
  assert.deepEqual(port.uploads, [{ threadId: "id-1", messageId: "id-2", images: [{ type: "image", ...image, sizeBytes: 4 }] }]);
  assert.deepEqual(
    port.commands.map((command) => [command.type, command.threadId]),
    [["thread.create", "id-1"], ["message.dispatch", "id-1"]],
  );
  assert.equal(port.commands[0]!.runtimeMode, "auto");
  assert.deepEqual(port.commands[0]!.modelSelection, selection);
  assert.equal(port.commands[1]!.messageId, "id-2");
  assert.deepEqual(port.commands.map((command) => command.commandId), ["id-3", "id-4"]);
  assert.deepEqual(port.commands[1]!.attachments, [{ type: "image", id: "stored-0", name: "shot.png", mimeType: "image/png", sizeBytes: 4 }]);
});

test("POST /api/threads refuses a bad runtime mode or bad images before any T3 call", async () => {
  const { server, port } = await start();
  const base = { projectId: "p", title: "t", text: "x", modelSelection: model };
  const bad = [{ ...base, runtimeMode: "yolo" }, { ...base, attachments: [{ name: "a.pdf", mimeType: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA" }] }];
  for (const body of bad) assert.equal((await post(server, "/api/threads", body)).status, 400, JSON.stringify(body));
  assert.deepEqual([port.uploads, port.commands], [[], []]);
});

test("POST /api/threads may exceed 1 MB for images", async () => {
  const { server } = await start();
  const big = { projectId: "p", title: "t", text: "x", modelSelection: model, attachments: [{ name: "a.png", mimeType: "image/png", dataUrl: `data:image/png;base64,${"A".repeat(2_000_000)}` }] };
  assert.equal((await post(server, "/api/threads", big)).status, 200);
});

test("messages: idle or unknown thread starts immediately", async () => {
  const { server, port } = await start();
  assert.deepEqual((await post(server, "/api/threads/idle-1/messages", { text: "Hi", mode: "steer" })).json, { ok: true });
  assert.deepEqual(port.commands[0]!.dispatchMode, { type: "start_immediately" });
  await post(server, "/api/threads/unknown/messages", { text: "Hi" });
  assert.deepEqual(port.commands[1]!.dispatchMode, { type: "start_immediately" });
  assert.equal(port.commands[0]!.threadId, "idle-1");
});

test("messages: active thread queues by default and steers through deliveryIntent", async () => {
  const { server, port } = await start();
  await post(server, "/api/threads/run-1/messages", { text: "Hi" });
  await post(server, "/api/threads/run-1/messages", { text: "Hi", mode: "queue" });
  await post(server, "/api/threads/run-1/messages", { text: "Hi", mode: "steer" });
  assert.deepEqual(
    port.commands.map((command) => [command.dispatchMode, command.deliveryIntent]),
    [[{ type: "queue_after_active" }, undefined], [{ type: "queue_after_active" }, undefined], [{ type: "start_immediately" }, "steer"]],
  );
});

test("messages: steer never fails for a missing run id; bad input gives 400", async () => {
  const { server, port } = await start();
  const steer = await post(server, "/api/threads/run-2/messages", { text: "Hi", mode: "steer" });
  assert.equal(steer.status, 200);
  assert.equal(port.commands[0]!.deliveryIntent, "steer");
  port.commands.length = 0;
  assert.equal((await post(server, "/api/threads/run-1/messages", { text: "  " })).status, 400);
  assert.equal((await post(server, "/api/threads/run-1/messages", { text: "x", mode: "restart" })).status, 400);
  assert.deepEqual(port.commands, []);
});

test("messages: an image alone is enough, blank text without image is not", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "", attachments: [{ name: " shot.png ", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw==" }] })).status, 200);
  assert.equal(port.commands[0]!.text, "");
  assert.equal((await post(server, "/api/threads/idle-1/messages", { text: " " })).status, 400);
});

test("messages: base64 length must be a multiple of 4 and names must not be blank", async () => {
  const { server } = await start();
  const base = { name: "a.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw==" };
  for (const bad of [{ ...base, dataUrl: "data:image/png;base64,iVBORw=" }, { ...base, dataUrl: "data:image/png;base64,iVBOR" }, { ...base, name: "  " }]) {
    assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "x", attachments: [bad] })).status, 400, JSON.stringify(bad));
  }
});

test("settings: model options keep only id with a scalar value", async () => {
  const { server, port } = await start();
  const options = [{ id: "effort", value: "high" }, { id: "x", value: { a: 1 } }, { value: "v" }, { id: "fast", value: true }, "junk"];
  await post(server, "/api/threads/idle-1/settings", { modelSelection: { ...model, options } });
  assert.deepEqual((port.commands[0]!.modelSelection as { options: unknown }).options, [{ id: "effort", value: "high" }, { id: "fast", value: true }]);
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

test("every response forbids framing and sniffing", async () => {
  const { server } = await start({ site: { serve: async () => new Response("<html></html>", { headers: { "content-type": "text/html" } }) } });
  for (const reply of [await call(server, "GET", "/api/health"), await call(server, "GET", "/"), await post(server, "/api/threads/x/nope")]) {
    assert.equal(reply.headers["x-frame-options"], "DENY");
    assert.equal(reply.headers["content-security-policy"], "frame-ancestors 'none'");
    assert.equal(reply.headers["x-content-type-options"], "nosniff");
  }
});

test("a site response keeps its body and status and gets the security headers in place", async () => {
  const site = new Response("<html></html>", { status: 203, headers: { "content-type": "text/html", etag: '"x"' } });
  const { server } = await start({ site: { serve: async () => site } });
  const res = await server.fetch(new Request("http://127.0.0.1/", { headers: { host: "127.0.0.1" } }));
  assert.equal(res, site);
  assert.deepEqual([res.status, await res.text(), res.headers.get("etag")], [203, "<html></html>", '"x"']);
  assert.deepEqual([res.headers.get("x-frame-options"), res.headers.get("content-security-policy"), res.headers.get("x-content-type-options")], ["DENY", "frame-ancestors 'none'", "nosniff"]);
});

test("a response with immutable headers is copied, not refused", async () => {
  const { server } = await start({ site: { serve: async () => Response.redirect("http://127.0.0.1/x", 302) } });
  const res = await server.fetch(new Request("http://127.0.0.1/", { headers: { host: "127.0.0.1" } }));
  assert.deepEqual([res.status, res.headers.get("x-frame-options")], [302, "DENY"]);
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

test("settle", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/threads/run-1/settle")).status, 200);
  assert.deepEqual(port.commands[0], { type: "thread.settle", commandId: "id-1", threadId: "run-1" });
});

test("unsettle", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/threads/run-1/unsettle")).status, 200);
  assert.deepEqual(port.commands[0], { type: "thread.unsettle", commandId: "id-1", threadId: "run-1", reason: "user" });
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

test("GET /api/threads/:id answers 304 to a matching if-none-match and a new etag once the thread changes", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m1", role: "user", text: "Hello" }], visibleTurnItems: [{ item: { messageId: "m1" } }] };
  const first = await call(server, "GET", "/api/threads/run-1");
  const etag = first.headers.etag!;
  assert.match(etag, /^W\/"[0-9a-z]+"$/);
  assert.equal(first.headers["cache-control"], "no-cache");
  const same = await call(server, "GET", "/api/threads/run-1", { headers: { "if-none-match": etag } });
  assert.deepEqual([same.status, same.text, same.headers.etag, same.headers["cache-control"]], [304, "", etag, "no-cache"]);
  const listed = await call(server, "GET", "/api/threads/run-1", { headers: { "if-none-match": `"x", ${etag}` } });
  assert.equal(listed.status, 304);
  port.projection = { messages: [{ id: "m1", role: "user", text: "Hello" }, { id: "m2", role: "assistant", text: "Hi" }], visibleTurnItems: [{ item: { messageId: "m1" } }, { item: { messageId: "m2" } }] };
  const changed = await call(server, "GET", "/api/threads/run-1", { headers: { "if-none-match": etag } });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.headers.etag, etag);
  assert.equal(changed.json.messages.length, 2);
});

test("GET /api/threads/:id errors carry no etag", async () => {
  const { server, port } = await start();
  port.projectionError = new Error("T3 answered 500");
  const reply = await call(server, "GET", "/api/threads/idle-1", { headers: { "if-none-match": "*" } });
  assert.deepEqual([reply.status, reply.headers.etag], [502, undefined]);
});

test("GET /api/threads/:id shows the shell's pending background tasks as running subagents", async () => {
  const { server, store } = await start();
  store.apply([{ kind: "thread.updated", thread: { id: "idle-1", projectId: "project-1", status: "completed", pendingBackgroundTasks: [{ taskId: "t1", description: "Explore" }] } }]);
  const detail = (await call(server, "GET", "/api/threads/idle-1")).json;
  assert.deepEqual(detail.subagents.map((s: { title: string; status: string }) => [s.title, s.status]), [["Explore", "running"]]);
});

test("a T3 failure gives 502 with its message", async () => {
  const { server, port } = await start();
  port.dispatchError = new Error("run.interrupt: no such thread");
  const reply = await post(server, "/api/threads/run-1/interrupt");
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
  assert.equal((await post(server, "/api/threads/run-1/interrupt", {}, { origin: "http://evil.example" })).status, 403);
  assert.equal((await call(server, "POST", "/api/threads/run-1/interrupt", { headers: { "content-type": "text/plain" }, raw: "{}" })).status, 400);
  assert.equal((await call(server, "POST", "/api/threads/run-1/interrupt", { raw: "{}" })).status, 400);
  assert.equal((await call(server, "POST", "/api/threads/run-1/interrupt", { raw: "{not json" })).status, 400);
  assert.equal((await call(server, "POST", "/api/threads/run-1/interrupt", { raw: "x".repeat(1_100_000), headers: { "content-type": "application/json" } })).status, 413);
  assert.deepEqual(port.commands, []);
});

test("allowed hosts extend the local ones for Host and Origin, ports ignored", async () => {
  const { server } = await start({ allowedHosts: ["box.tail.ts.net"] });
  const get = (headers: Record<string, string>) => call(server, "GET", "/api/health", { headers }).then((reply) => reply.status);
  assert.equal(await get({ host: "box.tail.ts.net:4300" }), 200);
  assert.equal(await get({ host: "BOX.tail.ts.net", origin: "https://box.tail.ts.net:4300" }), 200);
  assert.equal(await get({ host: "box.tail.ts.net", origin: "http://evil.example" }), 403);
  assert.equal(await get({ host: "evil.example", origin: "https://box.tail.ts.net" }), 403);
  assert.equal(await get({ host: "127.0.0.1", origin: "http://localhost:5173" }), 200);
});

test("every POST route refuses a body that is not JSON", async () => {
  const { server, port } = await start();
  const posts = [
    "/api/board/assign",
    "/api/setup/retry",
    "/api/setup/token",
    "/api/update/check",
    "/api/update/apply",
    "/api/settings/linear/key",
    "/api/settings/linear/disconnect",
    "/api/threads",
    "/api/automations",
    "/api/automations/task-1/delete",
    "/api/automations/task-1/rename",
    "/api/threads/run-1/messages",
    "/api/threads/run-1/settings",
    "/api/threads/run-1/interrupt",
    "/api/threads/run-1/requests/req-1/respond",
    "/api/threads/run-1/requests/req-1/dismiss",
  ];
  for (const path of posts) {
    assert.equal((await call(server, "POST", path, { headers: { "content-type": "text/plain" }, raw: "{}" })).status, 400, path);
  }
  assert.deepEqual(port.commands, []);
});

test("unknown API routes give 404 and never CORS headers", async () => {
  const { server } = await start();
  const reply = await call(server, "GET", "/api/nope");
  assert.equal(reply.status, 404);
  assert.ok(reply.json.error);
  assert.equal((await post(server, "/api/nope")).status, 404);
  assert.equal((await call(server, "GET", "/api/threads/run-1/interrupt")).status, 404);
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

const assignBody = { issueId: "issue-1", projectId: "project-1", text: "", modelSelection: { instanceId: "claudeAgent", model: "claude-opus-5-5" } };

test("GET /api/board returns the board and caches it until ?refresh=1", async () => {
  const { server, linearCalls } = await start({ linearKey: "key-1" });
  const first = await call(server, "GET", "/api/board");
  assert.equal(first.status, 200);
  const { issues, ...status } = first.json;
  assert.deepEqual(status, { configured: true, ok: true, error: null });
  assert.deepEqual(issues.map((issue: { identifier: string }) => issue.identifier), ["TEAM-1"]);
  await call(server, "GET", "/api/board");
  assert.equal(linearCalls.length, 1);
  await call(server, "GET", "/api/board?refresh=1");
  assert.equal(linearCalls.length, 2);
  assert.ok(!first.text.includes("key-1"));
});

test("POST /api/board/assign creates a thread on the issue with the chosen model", async () => {
  const { server, port } = await start({ linearKey: "key-1" });
  const reply = await post(server, "/api/board/assign", { ...assignBody, runtimeMode: "auto" });
  assert.deepEqual(reply.json, { ok: true, threadId: "id-1" });
  assert.deepEqual(
    port.commands.map((command) => command.type),
    ["thread.create", "message.dispatch"],
  );
  assert.equal(port.commands[0]!.projectId, "project-1");
  assert.equal(port.commands[0]!.title, "TEAM-1 Issue 1");
  assert.equal(port.commands[0]!.runtimeMode, "auto");
  assert.equal(port.commands[1]!.text, "Handle Linear issue TEAM-1: https://linear.example/TEAM-1");
  assert.deepEqual(port.commands[0]!.modelSelection, { instanceId: "claudeAgent", model: "claude-opus-5-5" });
});

test("assign puts the user's instructions first, then the issue link", async () => {
  const { server, port } = await start({ linearKey: "key-1" });
  await post(server, "/api/board/assign", { ...assignBody, text: "  Start with the tests.  " });
  assert.equal(port.commands[1]!.text, "Start with the tests.\n\nLinear issue TEAM-1: https://linear.example/TEAM-1");
});

test("assign without a project goes to T3's No project", async () => {
  const { server, port } = await start({ linearKey: "key-1" });
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, projectId: "" })).status, 200);
  assert.equal(port.commands[0]!.projectId, "scratch-project");
});

test("assign finds the project by title as well as by id", async () => {
  const { server, port } = await start({ linearKey: "key-1" });
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, projectId: "Project B" })).status, 200);
  assert.equal(port.commands[0]!.projectId, "project-2");
});

test("assign errors: 400 invalid body, 404 unknown issue, 409 unknown T3 project", async () => {
  const { server, port } = await start({ linearKey: "key-1" });
  const { modelSelection: _model, ...withoutModel } = assignBody;
  assert.equal((await post(server, "/api/board/assign", withoutModel)).status, 400);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, issueId: "" })).status, 400);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, text: 3 })).status, 400);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, runtimeMode: "yolo" })).status, 400);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, issueId: "nope" })).status, 404);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, projectId: "missing" })).status, 409);
  assert.deepEqual(port.commands, []);
});

test("the board shows the issues of every team", async () => {
  const teamNode = (n: number, key: string) => ({ ...linearNode(n), team: { key, name: `Team ${key}` } });
  const nodes = [teamNode(1, "ENG"), teamNode(2, "OPS"), teamNode(3, "HR")];
  const { server } = await start({ linearKey: "key-1", linearFetch: async () => linearPage(nodes) });
  const board = await call(server, "GET", "/api/board");
  assert.deepEqual(board.json.issues.map((issue: { id: string }) => issue.id), ["issue-1", "issue-2", "issue-3"]);
});

test("assign rereads Linear once when the issue is not in the cached board", async () => {
  let nodes = [linearNode(1)];
  const { server, linearCalls } = await start({
    linearKey: "key-1",
    linearFetch: async () => linearPage(nodes),
  });
  await call(server, "GET", "/api/board");
  nodes = [linearNode(1), linearNode(2)];
  const reply = await post(server, "/api/board/assign", { ...assignBody, issueId: "issue-2" });
  assert.equal(reply.status, 200);
  assert.equal(linearCalls.length, 2);
});

test("assign answers 502 when Linear fails and when T3 fails", async () => {
  const down = await start({ linearKey: "key-1", linearFetch: async () => new Response("no", { status: 500 }) });
  const linear = await post(down.server, "/api/board/assign", assignBody);
  assert.equal(linear.status, 502);
  assert.ok(!linear.text.includes("key-1"));
  const { server, port } = await start({ linearKey: "key-1" });
  port.dispatchError = new Error("T3 down");
  assert.equal((await post(server, "/api/board/assign", assignBody)).status, 502);
});

test("GET /api/automations returns the automations listed at each call", async () => {
  let calls = 0;
  const result: AutomationsResult = { automations: [], hiddenThreadIds: ["thread-1"], setupThreadIds: ["thread-2"] };
  const { server } = await start({ automations: { list: async () => (calls++, result), request: async () => "", remove: async () => {}, rename: async () => {} } });
  const first = await call(server, "GET", "/api/automations");
  assert.equal(first.status, 200);
  assert.equal(first.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(first.json, result);
  await call(server, "GET", "/api/automations");
  assert.equal(calls, 2);
});

test("an automations failure gives 502", async () => {
  const failing = async () => {
    throw new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" });
  };
  const { server } = await start({ automations: { list: failing, request: failing, remove: failing, rename: failing } });
  assert.equal((await call(server, "GET", "/api/automations")).status, 502);
  assert.equal((await post(server, "/api/automations", { text: "x", projectId: "", modelSelection: model })).status, 502);
  assert.equal((await post(server, "/api/automations/task-1/delete", {})).status, 502);
});

test("POST /api/automations/:id/delete removes the task", async () => {
  const removed: string[] = [];
  const { server } = await start({ automations: { list: async () => ({ automations: [], hiddenThreadIds: [], setupThreadIds: [] }), request: async () => "x", remove: async (id) => void removed.push(id), rename: async () => {} } });
  const reply = await post(server, "/api/automations/task%2F1/delete", {});
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true });
  assert.deepEqual(removed, ["task/1"]);
});

test("POST /api/automations/:id/rename trims the title and passes it on", async () => {
  const renamed: unknown[] = [];
  const { server } = await start({ automations: { list: async () => ({ automations: [], hiddenThreadIds: [], setupThreadIds: [] }), request: async () => "x", remove: async () => {}, rename: async (id, title) => void renamed.push([id, title]) } });
  const reply = await post(server, "/api/automations/task%2F1/rename", { title: "  New name " });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true });
  assert.deepEqual(renamed, [["task/1", "New name"]]);
  for (const body of [{}, { title: "   " }, { title: 5 }, { title: "x".repeat(121) }]) assert.equal((await post(server, "/api/automations/task-1/rename", body)).status, 400, JSON.stringify(body));
  assert.equal((await post(server, "/api/automations/task-1/rename", { title: "x".repeat(120) })).status, 200);
});

test("rename errors map to 404, 409 and 502", async () => {
  const fail = (error: Error) => ({ list: async () => ({ automations: [], hiddenThreadIds: [], setupThreadIds: [] }), request: async () => "x", remove: async () => {}, rename: async () => Promise.reject(error) });
  const status = async (error: Error) => (await post((await start({ automations: fail(error) })).server, "/api/automations/task-1/rename", { title: "x" })).status;
  assert.equal(await status(new DomainError("not-found", "gone")), 404);
  assert.equal(await status(new DomainError("conflict", "webhook")), 409);
  assert.equal(await status(new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" })), 502);
});

test("POST /api/automations passes the request on and returns the thread id", async () => {
  const requests: unknown[] = [];
  const { server } = await start({ automations: { list: async () => ({ automations: [], hiddenThreadIds: [], setupThreadIds: [] }), request: async (body) => (requests.push(body), "thread-9"), remove: async () => {}, rename: async () => {} } });
  const reply = await post(server, "/api/automations", { text: " Remind me ", projectId: " project-1 ", modelSelection: model, runtimeMode: "auto" });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true, threadId: "thread-9" });
  assert.deepEqual(requests, [{ text: "Remind me", projectId: "project-1", modelSelection: model, runtimeMode: "auto" }]);
});

test("POST /api/automations validates its body", async () => {
  const requests: unknown[] = [];
  const { server } = await start({ automations: { list: async () => ({ automations: [], hiddenThreadIds: [], setupThreadIds: [] }), request: async (body) => (requests.push(body), "x"), remove: async () => {}, rename: async () => {} } });
  const bad = [
    { projectId: "", modelSelection: model },
    { text: "  ", projectId: "", modelSelection: model },
    { text: "x".repeat(2001), projectId: "", modelSelection: model },
    { text: "x", projectId: 3, modelSelection: model },
    { text: "x", projectId: "" },
    { text: "x", projectId: "", modelSelection: model, runtimeMode: "nope" },
  ];
  for (const body of bad) assert.equal((await post(server, "/api/automations", body)).status, 400, JSON.stringify(body));
  assert.equal((await post(server, "/api/automations", { text: "x", modelSelection: model })).status, 200);
  assert.deepEqual(requests, [{ text: "x", projectId: "", modelSelection: model }]);
});

const KEY = "lin_api_secretkey_ABCD";
const viewerOk = async () => new Response(JSON.stringify({ data: { viewer: { id: "u1" } } }));

test("GET /api/settings reports the Linear state without the key", async () => {
  const { server } = await start({ linear: { apiKey: KEY, teams: { TEAM: "Project A" } } });
  const reply = await call(server, "GET", "/api/settings");
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, {
    linear: { connected: true, keyTail: "ABCD" },
  });
  assert.ok(!reply.text.includes(KEY));
});

test("POST /api/settings/linear/key verifies the key, writes it and refreshes the board", async () => {
  const { server, files, linearCalls } = await start({ linear: {}, linearFetch: viewerOk });
  const reply = await post(server, "/api/settings/linear/key", { apiKey: ` ${KEY} ` });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json.linear, { connected: true, keyTail: "ABCD" });
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

test("attachments: an image of the thread passes through with its type and the default framing ban", async () => {
  const { server, port } = await start();
  const reply = await call(server, "GET", "/api/threads/t1/attachments/t1-img");
  assert.equal(reply.status, 200);
  assert.equal(reply.text, "bytes");
  assert.equal(reply.headers["content-type"], "image/png");
  assert.equal(reply.headers["x-frame-options"], "DENY");
  assert.deepEqual(port.assets, [{ _tag: "attachment", attachmentId: "t1-img" }]);
});

test("attachments: an id of another thread is refused before any T3 call", async () => {
  const { server, port } = await start();
  assert.equal((await call(server, "GET", "/api/threads/t1/attachments/t2-img")).status, 404);
  assert.deepEqual(port.assets, []);
});

test("attachments: a page is themed and sandboxed, and only the dashboard may frame it", async () => {
  const { server, port } = await start();
  port.assetFileName = "t1-page-html.html";
  const reply = await call(server, "GET", "/api/threads/t1/attachments/t1-page-html?theme=dark");
  assert.equal(reply.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(reply.headers["content-security-policy"], "sandbox allow-scripts allow-popups; frame-ancestors 'self'");
  assert.equal(reply.headers["x-frame-options"], "SAMEORIGIN");
  assert.match(reply.text, /color-scheme: dark/);
  assert.match(reply.text, /bytes$/);
});

test("media: only an absolute image path that a message of the thread shows", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m", role: "assistant", text: "Done: ![shot](/tmp/out/shot.png)" }] };
  const get = (path: string) => call(server, "GET", `/api/threads/t1/media?path=${encodeURIComponent(path)}`);
  assert.equal((await get("/tmp/out/shot.png")).status, 200);
  assert.equal((await get("/etc/passwd")).status, 400);
  assert.equal((await get("/tmp/out/other.png")).status, 404);
  assert.equal((await get("relative/shot.png")).status, 400);
  assert.equal((await call(server, "GET", "/api/threads/t1/media")).status, 400);
  assert.deepEqual(port.assets, [{ _tag: "media-file", threadId: "t1", path: "/tmp/out/shot.png" }]);
});

test("media: images of one thread share a single projection fetch, and a new citation is found", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m", role: "assistant", text: "![a](/tmp/a.png) ![b](/tmp/b.png) ![c](/tmp/c.png)" }] };
  const get = (path: string) => call(server, "GET", `/api/threads/t9/media?path=${encodeURIComponent(path)}`);
  const statuses = await Promise.all(["/tmp/a.png", "/tmp/b.png", "/tmp/c.png"].map(get));
  assert.deepEqual(statuses.map((reply) => reply.status), [200, 200, 200]);
  assert.equal(port.projectionCalls, 1);
  assert.equal((await get("/tmp/a.png")).status, 200);
  assert.equal(port.projectionCalls, 1);
  assert.equal((await get("/tmp/d.png")).status, 404);
  assert.equal(port.projectionCalls, 2);
  port.projection = { messages: [{ id: "m", role: "assistant", text: "![d](/tmp/d.png)" }] };
  assert.equal((await get("/tmp/d.png")).status, 200);
  assert.equal(port.projectionCalls, 3);
});

test("media: concurrent misses for new citations share one refetch", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m", role: "assistant", text: "![a](/tmp/a.png)" }] };
  const get = (path: string) => call(server, "GET", `/api/threads/t7/media?path=${encodeURIComponent(path)}`);
  assert.equal((await get("/tmp/a.png")).status, 200);
  port.projection = { messages: [{ id: "m", role: "assistant", text: "![b](/tmp/b.png) ![c](/tmp/c.png) ![d](/tmp/d.png)" }] };
  const statuses = await Promise.all(["/tmp/b.png", "/tmp/c.png", "/tmp/d.png"].map(get));
  assert.deepEqual(statuses.map((reply) => reply.status), [200, 200, 200]);
  assert.equal(port.projectionCalls, 2);
});

test("media: a failed projection fetch is not cached", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m", role: "assistant", text: "![a](/tmp/a.png)" }] };
  const path = encodeURIComponent("/tmp/a.png");
  port.projectionError = new Error("T3 answered 500");
  assert.equal((await call(server, "GET", `/api/threads/t8/media?path=${path}`)).status, 502);
  port.projectionError = null;
  assert.equal((await call(server, "GET", `/api/threads/t8/media?path=${path}`)).status, 200);
});

test("attachments: a type the browser could run is downloaded, never rendered on the dashboard origin", async () => {
  const { server, port } = await start();
  port.assetType = "text/html";
  const reply = await call(server, "GET", "/api/threads/t1/attachments/t1-img");
  assert.equal(reply.headers["content-type"], "application/octet-stream");
  assert.equal(reply.headers["content-disposition"], "attachment");
  assert.equal(reply.headers["x-content-type-options"], "nosniff");
});

test("attachments: an id with path characters is refused before any T3 call", async () => {
  const { server, port } = await start();
  assert.equal((await call(server, "GET", "/api/threads/t1/attachments/t1-..%2F..%2Fsecret")).status, 404);
  assert.deepEqual(port.assets, []);
});

test("media: the path must be the target of a markdown image, not any text in parentheses", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m", role: "assistant", text: "See (/tmp/a.png) and ![b](/tmp/a\\_b.png)" }] };
  const get = (path: string) => call(server, "GET", `/api/threads/t1/media?path=${encodeURIComponent(path)}`);
  assert.equal((await get("/tmp/a.png")).status, 404);
  assert.equal((await get("/tmp/a_b.png")).status, 200);
  assert.equal((await get("/tmp/../etc/x.png")).status, 400);
  assert.equal((await get("/tmp/x\0.png")).status, 400);
});

test("media: a cited video streams by byte range", async () => {
  const { server, port } = await start();
  port.projection = { messages: [{ id: "m", role: "assistant", text: "![demo](/tmp/out/demo.mp4)" }] };
  port.fetchAsset = async (resource, range) => {
    port.assets.push(resource);
    port.ranges.push(range);
    return { response: new Response("vid", { status: 206, headers: { "content-type": "video/mp4", "content-range": "bytes 0-2/10", "accept-ranges": "bytes" } }), fileName: "demo.mp4" };
  };
  const reply = await call(server, "GET", `/api/threads/t1/media?path=${encodeURIComponent("/tmp/out/demo.mp4")}`, { headers: { range: "bytes=0-2" } });
  assert.equal(reply.status, 206);
  assert.equal(reply.headers["content-type"], "video/mp4");
  assert.equal(reply.headers["content-range"], "bytes 0-2/10");
  assert.deepEqual(port.ranges, ["bytes=0-2"]);
});

test("the manifest, the service worker and the icons are served before the site", async () => {
  const { server } = await start({ site: { serve: async () => new Response("<p>app</p>") } });
  const manifest = await call(server, "GET", "/manifest.webmanifest");
  assert.equal(manifest.headers["content-type"], "application/manifest+json");
  const body = manifest.json as { display: string; start_url: string; icons: Array<{ src: string; sizes: string; purpose: string }> };
  assert.equal(body.display, "standalone");
  assert.equal(body.start_url, "/");
  for (const size of ["192x192", "512x512"]) assert.ok(body.icons.some((icon) => icon.sizes === size && icon.purpose === "any"), size);
  assert.ok(body.icons.some((icon) => icon.purpose === "maskable"));

  const worker = await call(server, "GET", "/sw.js");
  assert.match(worker.headers["content-type"]!, /^text\/javascript/);
  assert.match(worker.text, /addEventListener\("fetch"/);

  for (const icon of body.icons) {
    const res = await call(server, "GET", icon.src);
    assert.equal(res.status, 200, icon.src);
    assert.match(res.headers["content-type"]!, /^image\//);
    assert.ok(res.text.length > 100, icon.src);
  }
  assert.equal((await call(server, "GET", "/")).text, "<p>app</p>");
});

test("GET /api/search returns the matches of listed threads and sends the trimmed query and limit to T3", async () => {
  const { server, port } = await start();
  const match = (threadId: string) => ({ threadId, projectId: "project-1", source: "assistant" as const, snippet: `hit ${threadId}`, messageCreatedAt: null });
  port.searchResult = [match("run-1"), match("unknown"), match("idle-1")];
  const reply = await call(server, "GET", "/api/search?q=%20deploy%20&limit=7");
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { matches: [match("run-1"), match("idle-1")] });
  assert.deepEqual(port.searchCalls, [{ query: "deploy", limit: 7 }]);
  await call(server, "GET", "/api/search?q=deploy");
  assert.deepEqual(port.searchCalls[1], { query: "deploy", limit: 50 });
});

test("GET /api/search refuses a bad query or limit before any T3 call", async () => {
  const { server, port } = await start();
  for (const path of ["/api/search", "/api/search?q=a", "/api/search?q=%20a%20", `/api/search?q=${"a".repeat(201)}`, "/api/search?q=ab&limit=0", "/api/search?q=ab&limit=51", "/api/search?q=ab&limit=x", "/api/search?q=ab&limit=1.5", "/api/search?q=ab&limit="]) {
    assert.equal((await call(server, "GET", path)).status, 400, path);
  }
  assert.equal((await call(server, "GET", `/api/search?q=${"a".repeat(200)}`)).status, 200);
  assert.equal(port.searchCalls.length, 1);
});

test("stopping a subagent sends subagent.stop, 404 when unknown", async () => {
  const { server, port } = await start();
  port.projection = { subagents: [{ id: "sub 1", runId: "run-a", status: "running" }] };
  assert.deepEqual((await post(server, "/api/threads/run-1/subagents/sub%201/stop")).json, { ok: true });
  assert.deepEqual(port.commands, [{ type: "subagent.stop", commandId: "id-1", threadId: "run-1", runId: "run-a", subagentId: "sub 1" }]);
  assert.equal((await post(server, "/api/threads/run-1/subagents/other/stop")).status, 404);
});
