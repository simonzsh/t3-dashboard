import assert from "node:assert/strict";
import { afterEach, test } from "bun:test";
import type { CacheCleanupPreview, CacheCleanupResult, LimitsOverview, ServerStats, UsageOverview, Automation, AutomationsResult, ConnectionStatus, DashboardEvent, DashboardState, NewsState } from "../../shared/api.ts";
import { LinearClient } from "../../src/integrations/linear/client.ts";
import { createActions } from "../../src/domain/actions.ts";
import type { Automations } from "../../src/domain/automations.ts";
import type { News } from "../../src/domain/news.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { LinearBoard } from "../../src/domain/linearBoard.ts";
import { readLinearKey } from "../../src/config/linearFile.ts";
import { SessionsStore } from "../../src/domain/sessionsStore.ts";
import { StashStore } from "../../src/domain/stashStore.ts";
import type { StashEntry } from "../../shared/stash.ts";
import type { SharedSessions } from "../../shared/sessions.ts";
import type { SeenState } from "../../shared/seen.ts";
import { SeenStore } from "../../src/domain/seenStore.ts";
import { createSettings } from "../../src/domain/settings.ts";
import { createDashboardServer } from "../../src/server/server.ts";
import type { DashboardHandler } from "../../src/server/server.ts";
import type { Site } from "../../src/server/site.ts";
import { UpdateManager } from "../../src/domain/updates.ts";
import { ShellStore } from "../../src/domain/shellStore.ts";
import { SseHub } from "../../src/server/sse.ts";
import { VERSION } from "../../src/config/version.ts";
import { FakePort } from "../helpers/fakePort.ts";
import { linearInbox, linearInboxNode, linearNode, linearPage } from "../helpers/linear.ts";
import type { RawConfig, ShellItem } from "../../src/integrations/t3/schemas.ts";

const now = new Date("2026-03-20T12:00:00.000Z");
const connection: ConnectionStatus = { t3: "live", serverVersion: "1.0.0", protocolMismatch: false, error: null, setup: null };

const running = [] as Array<() => Promise<void>>;
afterEach(async () => {
  for (const stop of running.splice(0)) await stop();
});

interface StartOptions {
  limitsError?: Error;
  cleanupError?: Error;
  site?: Site;
  linearKey?: string;
  linearFetch?: (url: string, init: RequestInit) => Promise<Response>;
  // Notifications the fake Linear answers to the inbox query.
  inbox?: unknown[];
  news?: Partial<Pick<News, "get" | "article" | "save" | "runNow" | "remove" | "removeAll">>;
  automations?: Pick<Automations, "list" | "create" | "remove" | "update"> & Partial<Pick<Automations, "setEnabled" | "runNow">>;
  // Content of the Linear file. Without it, `linearKey` feeds the board directly.
  linear?: unknown;
  pasteResult?: "ok" | "rejected" | "unreachable" | "locked";
  update?: { unavailable?: string | null; tag?: string };
  allowedHosts?: string[];
  sessions?: SharedSessions | null;
  stash?: StashEntry[];
  seen?: SeenState | null;
}

const CACHE_PREVIEW: CacheCleanupPreview = { supported: true, targets: [{ id: "npm", label: "npm cache", bytes: 300 }, { id: "uv", label: "uv cache", bytes: 200 }], totalBytes: 500 };
const CACHE_RESULT: CacheCleanupResult = { targets: [{ id: "npm", label: "npm cache", freedBytes: 300, error: null }, { id: "uv", label: "uv cache", freedBytes: 0, error: "EBUSY" }], totalBytes: 300 };

const SERVER_STATS: ServerStats = {
  host: "box",
  os: "Linux",
  uptimeSeconds: 3600,
  cpu: { usedPercent: 12.5, cores: 4 },
  memory: { usedBytes: 4, totalBytes: 16, usedPercent: 25 },
  disk: null,
  readAt: "2026-03-07T10:00:00.000Z",
};
const usageTotals = { turns: 0, costUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
const usageOverview: UsageOverview = {
  period: 7,
  days: Array.from({ length: 14 }, (_, index) => ({ day: `2026-03-${String(7 + index).padStart(2, "0")}`, ...usageTotals })),
  current: usageTotals,
  previous: usageTotals,
  sessions: { current: 0, previous: 0 },
  turnsPartial: false,
  cost: { status: "ok", detail: null, refreshing: false },
  readAt: now.toISOString(),
};

const newsState: NewsState = { settings: { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", language: "English", modelSelection: null }, task: null, articles: [{ date: "2026-11-07", title: "News", mtimeMs: 1 }], running: null };

const LINEAR_FILE = "/cfg/linear.json";

async function start(startOptions: StartOptions = {}) {
  const { site = { serve: async () => null }, linearKey = "", linearFetch, automations = { list: async () => ({ automations: [], automationThreadIds: [], setupThreadIds: [] }), create: async () => created, remove: async () => {}, update: async () => {} } } = startOptions;
  const linearCalls: string[] = [];
  const files: Record<string, string> = startOptions.linear === undefined ? {} : { [LINEAR_FILE]: JSON.stringify(startOptions.linear) };
  const readFile = (path: string) => {
    if (path in files) return files[path]!;
    throw new Error("ENOENT");
  };
  const board = new LinearBoard({
    client: new LinearClient(async (url, init) => {
      // linearCalls counts the other queries: one board read sends the inbox query too.
      if (String(init.body).includes("notifications")) return linearInbox(startOptions.inbox ?? []);
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
  const usageCalls: Array<{ timeZone: string; period: number; refresh: boolean }> = [];
  const usage = { get: async (timeZone: string, period: number, refresh: boolean) => (usageCalls.push({ timeZone, period, refresh }), usageOverview) };
  const limitsCalls: boolean[] = [];
  const limits = {
    get: async (refresh: boolean): Promise<LimitsOverview> => {
      limitsCalls.push(refresh);
      if (startOptions.limitsError) throw startOptions.limitsError;
      return { supported: true, providers: [], readAt: "2026-03-07T10:00:00.000Z" };
    },
  };
  const serverStats = { get: async (): Promise<ServerStats> => SERVER_STATS };
  const cleanupCalls: string[] = [];
  const cacheCleanup = {
    sizes: async (): Promise<CacheCleanupPreview> => (cleanupCalls.push("sizes"), CACHE_PREVIEW),
    clear: async (): Promise<CacheCleanupResult> => {
      cleanupCalls.push("clear");
      if (startOptions.cleanupError) throw startOptions.cleanupError;
      return CACHE_RESULT;
    },
  };
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
          { id: "idle-1", projectId: "project-1", title: "Thread 1", status: "idle", worktreePath: "/work/wt", createdAt: "2026-03-01T00:00:00Z" },
          { id: "run-1", projectId: "project-1", title: "Thread 2", status: "running", activeRunId: "run-a", createdAt: "2026-03-02T00:00:00Z" },
          { id: "run-2", projectId: "project-1", title: "Thread 3", status: "running", activeRunId: null, createdAt: "2026-03-03T00:00:00Z" },
        ],
        projects: [{ id: "project-1", title: "Project A", workspaceRoot: "/work/root" }, { id: "project-2", title: "Project B" }],
      },
    },
    { kind: "synchronized" },
  ]);
  const savedSessions: SharedSessions[] = [];
  const sessions = new SessionsStore(startOptions.sessions ?? null, (value) => void savedSessions.push(value));
  const savedStashes: StashEntry[][] = [];
  let stashed = 0;
  const stash = new StashStore(startOptions.stash ?? [], (entries) => void savedStashes.push(entries), { now: () => new Date("2026-11-04T10:00:00Z"), newId: () => `stash-${++stashed}` });
  const savedSeen: SeenState[] = [];
  const seen = new SeenStore(startOptions.seen ?? null, (value) => void savedSeen.push(value));
  const events: DashboardEvent[] = [];
  const broadcast = hub.broadcast.bind(hub);
  hub.broadcast = (event) => (events.push(event), broadcast(event));
  const actions = createActions({ port, store, board, newId: () => `id-${++counter}` });
  const server: DashboardHandler = createDashboardServer({
    actions,
    sessions,
    stash,
    seen,
    hub,
    board,
    usage,
    limits,
    serverStats,
    cacheCleanup,
    automations: { setEnabled: async () => {}, runNow: async () => {}, ...automations },
    news: { get: async () => newsState, article: async (date) => ({ date, title: "T", markdown: "# T" }), save: async () => newsState, runNow: async () => {}, remove: async () => {}, removeAll: async () => 0, ...startOptions.news },
    getState,
    connection: () => connection,
    site,
    settings,
    setup,
    updates,
    allowedHosts: startOptions.allowedHosts,
  });
  running.push(async () => hub.close());
  return { port, store, hub, server, cleanupCalls, usageCalls, limitsCalls, savedSessions, savedStashes, savedSeen, events, linearCalls, files, setupCalls, updateRuns };
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
const created = { ok: true as const, id: "task-9", webhookUrl: null, nextRunAt: null };

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

test("queue routes send the matching T3 command", async () => {
  const { server, port } = await start();
  port.projection = { runs: [{ id: "run-a", status: "running" }, { id: "q1", status: "queued" }] };
  assert.deepEqual((await post(server, "/api/threads/run-1/queue/q1/send")).json, { ok: true });
  await post(server, "/api/threads/run-1/queue/q1/edit", { text: "new" });
  await post(server, "/api/threads/run-1/queue/q1/cancel");
  assert.deepEqual(port.commands.map((c) => [c.type, c.queuedRunId, c.targetRunId, c.runId, c.text]), [
    ["queued-message.promote-to-steer", "q1", "run-a", undefined, undefined],
    ["queued-run.edit", undefined, undefined, "q1", "new"],
    ["queued-run.cancel", undefined, undefined, "q1", undefined],
  ]);
});

test("queue routes: a blank edit is 400, a run that left the queue is 409, and nothing is sent", async () => {
  const { server, port } = await start();
  port.projection = { runs: [{ id: "q1", status: "queued" }, { id: "r1", status: "running" }] };
  for (const body of [{ text: "  " }, { text: 3 }, {}]) assert.equal((await post(server, "/api/threads/run-1/queue/q1/edit", body)).status, 400);
  for (const action of ["send", "cancel"]) assert.equal((await post(server, `/api/threads/run-1/queue/r1/${action}`)).status, 409);
  assert.equal((await post(server, "/api/threads/run-1/queue/r1/edit", { text: "x" })).status, 409);
  assert.deepEqual(port.commands, []);
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

test("rewind sends the checkpoint rollback and validates the body", async () => {
  const { server, port } = await start();
  port.projection = {
    messages: [{ id: "u1", role: "user", text: "x" }],
    runs: [{ id: "r1", ordinal: 1, status: "completed", userMessageId: "u1" }],
    checkpoints: [{ id: "c0", scopeId: "s", runId: null, status: "ready", ordinalWithinScope: 0, appRunOrdinal: null }],
  };
  for (const body of [{}, { messageId: "", restoreFiles: false }, { messageId: "u1" }, { messageId: "u1", restoreFiles: "yes" }]) assert.equal((await post(server, "/api/threads/idle-1/rewind", body)).status, 400, JSON.stringify(body));
  assert.equal((await post(server, "/api/threads/idle-1/rewind", { messageId: "u1", restoreFiles: true })).status, 200);
  assert.deepEqual(port.commands, [{ type: "checkpoint.rollback", commandId: "id-1", threadId: "idle-1", scopeId: "s", checkpointId: "c0", restoreFiles: true }]);
  assert.equal((await post(server, "/api/threads/idle-1/rewind", { messageId: "nope", restoreFiles: false })).status, 409);
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
    "/api/sessions",
    "/api/stash",
    "/api/seen",
    "/api/cache-cleanup",
    "/api/setup/retry",
    "/api/setup/token",
    "/api/update/check",
    "/api/update/apply",
    "/api/settings/linear/key",
    "/api/settings/linear/disconnect",
    "/api/threads",
    "/api/attachments",
    "/api/attachments/att-1/delete",
    "/api/automations",
    "/api/automations/task-1/delete",
    "/api/automations/task-1/update",
    "/api/automations/task-1/enabled",
    "/api/automations/task-1/run",
    "/api/news/settings",
    "/api/news/run",
    "/api/news/delete-all",
    "/api/news/2026-11-07/delete",
    "/api/threads/run-1/messages",
    "/api/threads/run-1/settings",
    "/api/threads/run-1/interrupt",
    "/api/threads/run-1/requests/req-1/respond",
    "/api/threads/run-1/requests/req-1/dismiss",
    "/api/threads/run-1/secrets/item-1",
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
  const { issues, readAt, ...status } = first.json;
  assert.deepEqual(status, { configured: true, ok: true, error: null, inbox: [], inboxError: null });
  assert.ok(!Number.isNaN(Date.parse(readAt)));
  assert.deepEqual(issues.map((issue: { identifier: string }) => issue.identifier), ["TEAM-1"]);
  await call(server, "GET", "/api/board");
  assert.equal(linearCalls.length, 1);
  await call(server, "GET", "/api/board?refresh=1");
  assert.equal(linearCalls.length, 2);
  assert.ok(!first.text.includes("key-1"));
});

test("GET /api/board passes the unread inbox through, and an inbox failure alone", async () => {
  const { server } = await start({ linearKey: "key-1", inbox: [linearInboxNode(1), linearInboxNode(2, { readAt: "2026-03-20T11:00:00.000Z" })] });
  const { inbox, inboxError } = (await call(server, "GET", "/api/board")).json;
  assert.deepEqual([inbox.map((item: { id: string }) => item.id), inboxError], [["notif-1"], null]);
  const broken = await start({ linearKey: "key-1", inbox: [{ id: "x" }] });
  const reply = (await call(broken.server, "GET", "/api/board")).json;
  assert.deepEqual([reply.ok, reply.issues.length, reply.inbox, typeof reply.inboxError], [true, 1, [], "string"]);
});

test("GET /api/usage returns the overview for the zone and passes ?refresh=1", async () => {
  const { server, usageCalls } = await start();
  const first = await call(server, "GET", "/api/usage?tz=Europe%2FParis");
  assert.equal(first.status, 200);
  assert.equal(first.json.days.length, 14);
  await call(server, "GET", "/api/usage?tz=Europe%2FParis&refresh=1");
  assert.deepEqual(usageCalls, [{ timeZone: "Europe/Paris", period: 7, refresh: false }, { timeZone: "Europe/Paris", period: 7, refresh: true }]);
});

test("GET /api/usage passes ?period= and refuses any other value", async () => {
  const { server, usageCalls } = await start();
  await call(server, "GET", "/api/usage?tz=UTC&period=30");
  assert.deepEqual(usageCalls, [{ timeZone: "UTC", period: 30, refresh: false }]);
  for (const bad of ["14", "abc", "", "30.0"]) {
    const reply = await call(server, "GET", `/api/usage?tz=UTC&period=${bad}`);
    assert.equal(reply.status, 400);
    assert.equal(reply.json.error, "period must be 7, 30 or 90");
  }
  assert.equal(usageCalls.length, 1);
});

test("GET /api/limits returns the overview and passes ?refresh=1", async () => {
  const { server, limitsCalls } = await start();
  const first = await call(server, "GET", "/api/limits");
  assert.equal(first.status, 200);
  assert.deepEqual(first.json, { supported: true, providers: [], readAt: "2026-03-07T10:00:00.000Z" });
  await call(server, "GET", "/api/limits?refresh=1");
  assert.deepEqual(limitsCalls, [false, true]);
});

test("GET /api/limits answers 502 with T3's message when the read fails", async () => {
  const { server } = await start({ limitsError: new IntegrationError("T3 Code is not running", { system: "t3", kind: "unreachable" }) });
  const reply = await call(server, "GET", "/api/limits");
  assert.equal(reply.status, 502);
  assert.equal(reply.json.error, "T3 Code is not running");
});

test("GET /api/usage without a time zone is a 400", async () => {
  const { server, usageCalls } = await start();
  const reply = await call(server, "GET", "/api/usage");
  assert.equal(reply.status, 400);
  assert.match(reply.json.error, /tz is required/);
  assert.equal(usageCalls.length, 0);
});

test("GET /api/usage refuses an unknown time zone with the usual error shape", async () => {
  const { server, usageCalls } = await start();
  const reply = await call(server, "GET", "/api/usage?tz=Mars%2FBase");
  assert.equal(reply.status, 400);
  assert.match(reply.json.error, /tz must be an IANA time zone/);
  assert.equal(usageCalls.length, 0);
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
  const result: AutomationsResult = { automations: [], automationThreadIds: ["thread-1"], setupThreadIds: ["thread-2"] };
  const { server } = await start({ automations: { list: async () => (calls++, result), create: async () => created, remove: async () => {}, update: async () => {} } });
  const first = await call(server, "GET", "/api/automations");
  assert.equal(first.status, 200);
  assert.equal(first.headers["content-type"], "application/json; charset=utf-8");
  assert.deepEqual(first.json, result);
  await call(server, "GET", "/api/automations");
  assert.equal(calls, 2);
});

test("GET /api/automations carries the kind and the webhook of each automation", async () => {
  const automation: Automation = {
    id: "task-1", kind: "webhook", title: "PR reviews", projectId: "p", project: "P", scheduleLabel: "Webhook", enabled: true,
    nextRunAt: null, lastRunAt: null, lastRunStatus: null, lastRunError: null, threadId: null, modelSelection: null,
    prompt: "Review", schedule: null, runtimeMode: null, bound: false,
    webhook: { url: "https://relay.example.invalid/v1/hooks/k/task-1/tok", signed: true, filters: [{ path: "body.action", op: "exists" }], signature: { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=" } }, runs: [{ threadId: "run-1", startedAt: "2026-03-20T10:00:00.000Z", finishedAt: null, status: "running", error: null }],
  };
  const { server } = await start({ automations: { list: async () => ({ automations: [automation], automationThreadIds: [], setupThreadIds: [] }), create: async () => created, remove: async () => {}, update: async () => {} } });
  const { json } = await call(server, "GET", "/api/automations");
  assert.deepEqual((json as AutomationsResult).automations, [automation]);
});

test("an automations failure gives 502", async () => {
  const failing = async () => {
    throw new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" });
  };
  const { server } = await start({ automations: { list: failing, create: failing, remove: failing, update: failing } });
  assert.equal((await call(server, "GET", "/api/automations")).status, 502);
  assert.equal((await post(server, "/api/automations", { ...routineBody })).status, 502);
  assert.equal((await post(server, "/api/automations/task-1/delete", {})).status, 502);
});

test("POST /api/automations/:id/delete removes the task", async () => {
  const removed: string[] = [];
  const { server } = await start({ automations: { list: async () => ({ automations: [], automationThreadIds: [], setupThreadIds: [] }), create: async () => created, remove: async (id) => void removed.push(id), update: async () => {} } });
  const reply = await post(server, "/api/automations/task%2F1/delete", {});
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true });
  assert.deepEqual(removed, ["task/1"]);
});

const updateStart = (updated: unknown[]) =>
  start({ automations: { list: async () => ({ automations: [], automationThreadIds: [], setupThreadIds: [] }), create: async () => created, remove: async () => {}, update: async (id, body) => void updated.push([id, body]) } });

test("POST /api/automations/:id/update validates the body and passes it on", async () => {
  const updated: unknown[] = [];
  const { server } = await updateStart(updated);
  const reply = await post(server, "/api/automations/task%2F1/update", { ...routineBody });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true });
  assert.deepEqual(updated, [["task/1", { kind: "routine", title: "", prompt: "Triage", projectId: "project-1", modelSelection: model, schedule: { type: "interval", everyMinutes: 15 } }]]);
  for (const body of [{}, { ...routineBody, prompt: "  " }, { ...routineBody, kind: "other" }, { ...routineBody, title: "x".repeat(121) }]) assert.equal((await post(server, "/api/automations/task-1/update", body)).status, 400, JSON.stringify(body));
});

test("an update may omit the signing secret, and a bad secret is refused without echoing it", async () => {
  const updated: unknown[] = [];
  const { server } = await updateStart(updated);
  const unchanged = { header: signature.header, encoding: signature.encoding, prefix: signature.prefix };
  assert.equal((await post(server, "/api/automations/task-1/update", { ...hookBody, signature: unchanged })).status, 200);
  assert.deepEqual((updated[0] as [string, { signature: unknown }])[1].signature, { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=" });
  const spaced = await post(server, "/api/automations/task-1/update", { ...hookBody, signature: { ...signature, secret: " has spaces " } });
  assert.equal(spaced.status, 400);
  assert.equal(spaced.text.includes("has spaces"), false);
});

test("a creation still needs the signing secret", async () => {
  const { server } = await createStart([]);
  const unchanged = { header: signature.header, encoding: signature.encoding, prefix: signature.prefix };
  assert.equal((await post(server, "/api/automations", { ...hookBody, signature: unchanged })).status, 400);
});

test("the rename route is gone", async () => {
  const { server } = await updateStart([]);
  assert.notEqual((await post(server, "/api/automations/task-1/rename", { title: "x" })).status, 200);
});

const toggleStart = (calls: unknown[], error?: Error) =>
  start({
    automations: {
      list: async () => ({ automations: [], automationThreadIds: [], setupThreadIds: [] }),
      create: async () => created,
      remove: async () => {},
      update: async () => {},
      setEnabled: async (id, enabled) => (error ? Promise.reject(error) : void calls.push(["enabled", id, enabled])),
      runNow: async (id) => (error ? Promise.reject(error) : void calls.push(["run", id])),
    },
  });

test("POST /api/automations/:id/enabled validates the flag and passes it on", async () => {
  const calls: unknown[] = [];
  const { server } = await toggleStart(calls);
  const reply = await post(server, "/api/automations/task%2F1/enabled", { enabled: false });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true });
  assert.deepEqual(calls, [["enabled", "task/1", false]]);
  for (const body of [{}, { enabled: "yes" }, { enabled: 1 }]) assert.equal((await post(server, "/api/automations/task-1/enabled", body)).status, 400, JSON.stringify(body));
  assert.equal(calls.length, 1);
});

test("POST /api/automations/:id/run starts a run", async () => {
  const calls: unknown[] = [];
  const { server } = await toggleStart(calls);
  const reply = await post(server, "/api/automations/task%2F1/run", {});
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true });
  assert.deepEqual(calls, [["run", "task/1"]]);
});

test("enabled and run map an unknown automation to 404 and a T3 failure to 502", async () => {
  const status = async (path: string, error: Error) => (await post((await toggleStart([], error)).server, path, { enabled: true })).status;
  for (const path of ["/api/automations/task-1/enabled", "/api/automations/task-1/run"]) {
    assert.equal(await status(path, new DomainError("not-found", "gone")), 404, path);
    assert.equal(await status(path, new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" })), 502, path);
  }
});

test("update errors map to 404, 400, 409 and 502", async () => {
  const fail = (error: Error) => ({ list: async () => ({ automations: [], automationThreadIds: [], setupThreadIds: [] }), create: async () => created, remove: async () => {}, update: async () => Promise.reject(error) });
  const status = async (error: Error) => (await post((await start({ automations: fail(error) })).server, "/api/automations/task-1/update", { ...routineBody })).status;
  assert.equal(await status(new DomainError("not-found", "gone")), 404);
  assert.equal(await status(new DomainError("invalid", "kind")), 400);
  assert.equal(await status(new DomainError("conflict", "webhook")), 409);
  assert.equal(await status(new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" })), 502);
});

const routineBody = { kind: "routine", title: " ", prompt: " Triage ", projectId: " project-1 ", modelSelection: model, schedule: { type: "interval", everyMinutes: 15 } };
const signature = { header: "X-Hub-Signature-256", encoding: "hex", prefix: "sha256=", secret: "s3cret-value" };
const hookBody = { ...routineBody, kind: "webhook", filters: [{ path: "headers.x-github-event", op: "equals", value: " pull_request " }, { path: "body.action", op: "in", value: ["opened", " closed "] }, { path: "body.pull_request", op: "exists" }], signature, schedule: undefined };

function createStart(requests: unknown[]) {
  const result = { ...created, webhookUrl: "https://relay.example.invalid/v1/hooks/k/t/token", nextRunAt: "2026-11-05T09:00:00.000Z" };
  return start({ automations: { list: async () => ({ automations: [], automationThreadIds: [], setupThreadIds: [] }), create: async (body) => (requests.push(body), result), remove: async () => {}, update: async () => {} } });
}

test("POST /api/automations passes a routine on and returns the task", async () => {
  const requests: unknown[] = [];
  const { server } = await createStart(requests);
  const reply = await post(server, "/api/automations", { ...routineBody, runtimeMode: "auto" });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true, id: "task-9", webhookUrl: "https://relay.example.invalid/v1/hooks/k/t/token", nextRunAt: "2026-11-05T09:00:00.000Z" });
  assert.deepEqual(requests, [{ kind: "routine", title: "", prompt: "Triage", projectId: "project-1", modelSelection: model, runtimeMode: "auto", schedule: { type: "interval", everyMinutes: 15 } }]);
});

test("POST /api/automations passes a reminder and a webhook on, with trimmed filters and a lowercase header", async () => {
  const requests: unknown[] = [];
  const { server } = await createStart(requests);
  const at = "2026-11-05T09:00:00.000Z";
  assert.equal((await post(server, "/api/automations", { ...routineBody, kind: "reminder", at, schedule: undefined })).status, 200);
  assert.equal((await post(server, "/api/automations", hookBody)).status, 200);
  assert.equal((await post(server, "/api/automations", { ...hookBody, signature: null, filters: [] })).status, 200);
  assert.deepEqual(requests[0], { kind: "reminder", title: "", prompt: "Triage", projectId: "project-1", modelSelection: model, at });
  assert.deepEqual((requests[1] as { filters: unknown; signature: unknown }).filters, [{ path: "headers.x-github-event", op: "equals", value: "pull_request" }, { path: "body.action", op: "in", value: ["opened", "closed"] }, { path: "body.pull_request", op: "exists" }]);
  assert.deepEqual((requests[1] as { signature: unknown }).signature, { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=", secret: "s3cret-value" });
  assert.deepEqual([(requests[2] as { signature: unknown }).signature, (requests[2] as { filters: unknown }).filters], [null, []]);
});

test("POST /api/automations validates its body and never repeats the secret", async () => {
  const requests: unknown[] = [];
  const { server } = await createStart(requests);
  const bad: unknown[] = [
    { text: "x", projectId: "", modelSelection: model },
    { ...routineBody, kind: "other" },
    { ...routineBody, prompt: "  " },
    { ...routineBody, prompt: "x".repeat(20_001) },
    { ...routineBody, title: "x".repeat(121) },
    { ...routineBody, projectId: 3 },
    { ...routineBody, modelSelection: undefined },
    { ...routineBody, runtimeMode: "nope" },
    { ...routineBody, schedule: { type: "interval", everyMinutes: 0 } },
    { ...routineBody, schedule: { type: "interval", everyMinutes: 1.5 } },
    { ...routineBody, schedule: { type: "interval", everyMinutes: 525_601 } },
    { ...routineBody, schedule: { type: "fixed_time", timeOfDay: "24:00", weekdays: [] } },
    { ...routineBody, schedule: { type: "fixed_time", timeOfDay: "09:00", weekdays: [7] } },
    { ...routineBody, schedule: { type: "fixed_time", timeOfDay: "09:00" } },
    { ...routineBody, kind: "reminder", schedule: undefined },
    { ...routineBody, kind: "reminder", at: "soon", schedule: undefined },
    { ...hookBody, filters: Array.from({ length: 17 }, () => ({ path: "body.a", op: "exists" })) },
    { ...hookBody, filters: [{ path: "env.x", op: "exists" }] },
    { ...hookBody, filters: [{ path: "body.a", op: "equals" }] },
    { ...hookBody, filters: [{ path: "body.a", op: "in", value: [] }] },
    { ...hookBody, filters: [{ path: "body.a", op: "in", value: ["a,b"] }] },
    { ...hookBody, filters: [{ path: "body.a", op: "like", value: "a" }] },
    { ...hookBody, signature: { ...signature, secret: "  " } },
    { ...hookBody, signature: { ...signature, encoding: "base32" } },
    { ...hookBody, signature: { ...signature, header: "bad header" } },
    { ...hookBody, signature: { ...signature, secret: "x".repeat(8193) } },
    { ...hookBody, signature: { ...signature, secret: " s3cret-value " } },
  ];
  for (const body of bad) {
    const reply = await post(server, "/api/automations", body);
    assert.equal(reply.status, 400, JSON.stringify(body));
    assert.equal(JSON.stringify(reply.json).includes("s3cret-value"), false);
  }
  assert.deepEqual(requests, []);
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

test("attachments: ?raw=1 serves a .html file as a download, not a themed page", async () => {
  const { server, port } = await start();
  port.assetFileName = "t1-notes-html.html";
  port.assetType = "text/html";
  const reply = await call(server, "GET", "/api/threads/t1/attachments/t1-notes-html?raw=1");
  assert.equal(reply.headers["content-type"], "application/octet-stream");
  assert.equal(reply.headers["content-disposition"], "attachment");
  assert.equal(reply.text, "bytes");
});

test("attachments: ?inline=1 shows a PDF in a frame, with no sandbox that would block the viewer", async () => {
  const { server, port } = await start();
  port.assetType = "application/pdf";
  const reply = await call(server, "GET", "/api/threads/t1/attachments/t1-doc?inline=1");
  assert.equal(reply.headers["content-type"], "application/pdf");
  assert.equal(reply.headers["content-disposition"], undefined);
  assert.equal(reply.headers["content-security-policy"], "frame-ancestors 'self'");
  assert.equal(reply.headers["x-frame-options"], "SAMEORIGIN");
  assert.equal(reply.headers["x-content-type-options"], "nosniff");
  assert.equal(reply.text, "bytes");
});

test("attachments: ?inline=1 serves a text file as sandboxed plain text, whatever its type", async () => {
  const { server, port } = await start();
  for (const type of ["text/markdown", "text/xml; charset=utf-8", "application/json"]) {
    port.assetType = type;
    const reply = await call(server, "GET", "/api/threads/t1/attachments/t1-notes?inline=1");
    assert.equal(reply.headers["content-type"], "text/plain; charset=utf-8");
    assert.equal(reply.headers["content-security-policy"], "sandbox; frame-ancestors 'self'");
    assert.equal(reply.headers["x-content-type-options"], "nosniff");
    assert.equal(reply.headers["content-disposition"], undefined);
  }
});

test("attachments: without ?inline=1, or with ?raw=1, a PDF or a text file stays a download", async () => {
  const { server, port } = await start();
  for (const [type, query] of [["application/pdf", ""], ["application/pdf", "?raw=1&inline=1"], ["text/plain", ""], ["text/plain", "?raw=1"]]) {
    port.assetType = type!;
    const reply = await call(server, "GET", `/api/threads/t1/attachments/t1-doc${query}`);
    assert.equal(reply.headers["content-type"], "application/octet-stream", `${type} ${query}`);
    assert.equal(reply.headers["content-disposition"], "attachment");
  }
});

test("attachments: ?inline=1 does not show an HTML or SVG type as such", async () => {
  const { server, port } = await start();
  port.assetType = "image/svg+xml";
  const reply = await call(server, "GET", "/api/threads/t1/attachments/t1-pic?inline=1");
  assert.equal(reply.headers["content-type"], "application/octet-stream");
  assert.equal(reply.headers["content-disposition"], "attachment");
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

test("GET /api/sessions is null until sessions are saved, then returns them", async () => {
  const fresh = await start();
  assert.deepEqual((await call(fresh.server, "GET", "/api/sessions")).json, { sessions: null });
  const saved = { ids: ["idle-1", "run-1"] };
  const known = await start({ sessions: saved });
  assert.deepEqual((await call(known.server, "GET", "/api/sessions")).json, { sessions: saved });
});

test("POST /api/sessions stores the set, serves it back and broadcasts it with its origin", async () => {
  const { server, savedSessions, events } = await start();
  const sessions = { ids: ["a", "b"] };
  const reply = await post(server, "/api/sessions", { sessions, origin: "tab-1" });
  assert.deepEqual(reply.json, { ok: true });
  assert.deepEqual(savedSessions, [sessions]);
  assert.deepEqual((await call(server, "GET", "/api/sessions")).json, { sessions });
  assert.deepEqual(events, [{ type: "sessions", data: { sessions, origin: "tab-1" } }]);
});

test("POST /api/sessions keeps unique string ids, up to 100", async () => {
  const { server, savedSessions } = await start();
  await post(server, "/api/sessions", { sessions: { ids: ["a", "a", 7, "b", ...Array.from({ length: 120 }, (_, i) => `t${i}`)] }, origin: "tab-1" });
  assert.deepEqual(savedSessions[0]!.ids.slice(0, 3), ["a", "b", "t0"]);
  assert.equal(savedSessions[0]!.ids.length, 100);
});

test("POST /api/sessions refuses a body without sessions or an origin, and saves nothing", async () => {
  const { server, savedSessions, events } = await start();
  const set = { ids: [] };
  const bad = [{}, { sessions: set }, { origin: "x" }, { sessions: {}, origin: "x" }, { sessions: { ids: "a" }, origin: "x" }, { sessions: { windows: [{ id: "a" }] }, origin: "x" }, { sessions: set, origin: "" }, { sessions: set, origin: 3 }, { sessions: [], origin: "x" }];
  for (const body of bad) assert.equal((await post(server, "/api/sessions", body)).status, 400, JSON.stringify(body));
  assert.deepEqual(savedSessions, []);
  assert.deepEqual(events, []);
});

// "hello" in base64.
const textFile = { name: " notes.txt ", mimeType: "text/plain", dataUrl: "data:text/plain;base64,aGVsbG8=" };

test("POST /api/attachments stores a file in T3 and answers its reference", async () => {
  const { server, port } = await start();
  const reply = await post(server, "/api/attachments", textFile);
  assert.deepEqual(reply.json, { ok: true, attachment: { type: "file", id: "file-1", name: "notes.txt", mimeType: "text/plain", sizeBytes: 5 } });
  assert.equal(new TextDecoder().decode(port.fileUploads[0]!.bytes), "hello");
  const image = await post(server, "/api/attachments", png);
  assert.deepEqual(image.json.attachment, { type: "image", id: "file-2", name: "shot.png", mimeType: "image/png", sizeBytes: 4 });
});

test("POST /api/attachments refuses a bad name, type, data URL or size before any T3 call", async () => {
  const { server, port } = await start();
  const big = (mimeType: string, bytes: number) => ({ name: "big", mimeType, dataUrl: `data:${mimeType};base64,${"A".repeat(Math.ceil((bytes + 1) / 3) * 4)}` });
  const bad = [
    {},
    { ...textFile, name: "  " },
    { ...textFile, name: "n".repeat(256) },
    { ...textFile, mimeType: "text" },
    { ...textFile, mimeType: `text/${"p".repeat(100)}` },
    { ...textFile, dataUrl: "data:text/html;base64,aGVsbG8=" },
    { ...textFile, dataUrl: "data:text/plain;base64,aGVsbG8" },
    { ...textFile, dataUrl: "data:text/plain;base64," },
    big("image/png", 10 * 1024 * 1024),
    big("application/zip", 50 * 1024 * 1024),
  ];
  for (const body of bad) assert.equal((await post(server, "/api/attachments", body)).status, 400, JSON.stringify(body).slice(0, 80));
  assert.deepEqual(port.fileUploads, []);
});

test("POST /api/attachments takes a file over 25 MB, up to 70 MB", async () => {
  const { server } = await start();
  const mimeType = "application/zip";
  const body = { name: "a.zip", mimeType, dataUrl: `data:${mimeType};base64,${"A".repeat(40 * 1024 * 1024)}` };
  assert.equal((await post(server, "/api/attachments", body)).status, 200);
});

test("POST /api/attachments/:id/delete removes the file in T3", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/attachments/att%201/delete")).status, 200);
  assert.deepEqual(port.deletedAttachments, ["att 1"]);
});

const upload = { type: "file", id: "att-1", name: "notes.txt", mimeType: "text/plain", sizeBytes: 5 };

test("messages: uploads alone are enough and go after the persisted images", async () => {
  const { server, port } = await start();
  assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "", uploads: [upload] })).status, 200);
  assert.deepEqual(port.commands[0]!.attachments, [upload]);
  assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "x", attachments: [png], uploads: [upload] })).status, 200);
  assert.deepEqual(port.commands[1]!.attachments, [{ type: "image", id: "stored-0", name: "shot.png", mimeType: "image/png", sizeBytes: 4 }, upload]);
});

test("messages: refuses bad upload refs and more than 100 attachments in total", async () => {
  const { server, port } = await start();
  const bad = [
    "x",
    [{ ...upload, type: "audio" }],
    [{ ...upload, id: "" }],
    [{ ...upload, id: "a/b" }],
    [{ ...upload, id: "a\nb" }],
    [{ ...upload, id: "i".repeat(257) }],
    [{ ...upload, name: "" }],
    [{ ...upload, mimeType: "m".repeat(101) }],
    [{ ...upload, sizeBytes: 0 }],
    [{ ...upload, sizeBytes: 1.5 }],
    Array.from({ length: 101 }, () => upload),
  ];
  for (const uploads of bad) assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "x", uploads })).status, 400, JSON.stringify(uploads).slice(0, 80));
  assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "x", attachments: [png], uploads: Array.from({ length: 100 }, () => upload) })).status, 400);
  assert.equal((await post(server, "/api/threads/idle-1/messages", { text: "x", uploads: Array.from({ length: 100 }, () => upload) })).status, 200);
  assert.deepEqual(port.uploads, []);
});

test("POST /api/threads takes uploads", async () => {
  const { server, port } = await start();
  const reply = await post(server, "/api/threads", { projectId: "project-1", title: "t", text: "x", modelSelection: model, uploads: [upload] });
  assert.equal(reply.status, 200);
  assert.deepEqual(port.commands[1]!.attachments, [upload]);
  assert.equal((await post(server, "/api/threads", { projectId: "project-1", title: "t", text: "x", modelSelection: model, uploads: [{ ...upload, id: "" }] })).status, 400);
});

test("POST /api/board/assign takes uploads", async () => {
  const { server, port } = await start({ linearKey: "key-1" });
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, uploads: [upload] })).status, 200);
  assert.deepEqual(port.commands[1]!.attachments, [upload]);
  assert.equal((await post(server, "/api/board/assign", { ...assignBody, uploads: [{ ...upload, id: "" }] })).status, 400);
});

test("GET /api/threads/:id/items/:itemId answers the step detail, 404 when T3 has no such item", async () => {
  const { server, port } = await start();
  port.turnItems["item-1"] = { id: "item-1", type: "command_execution", input: "ls", output: "a\nb", exitCode: 0 };
  const reply = await call(server, "GET", "/api/threads/run-1/items/item-1");
  assert.deepEqual(reply.json, { id: "item-1", kind: "command", input: "ls", output: "a\nb", exitCode: 0, diff: null, text: null, results: [], truncated: false });
  assert.deepEqual(port.turnItemCalls, [{ threadId: "run-1", itemId: "item-1" }]);
  assert.equal((await call(server, "GET", "/api/threads/run-1/items/missing")).status, 404);
  assert.equal((await call(server, "GET", `/api/threads/run-1/items/${"i".repeat(513)}`)).status, 400);
});

test("GET /api/threads/:id/files searches the worktree first, then the project root", async () => {
  const { server, port } = await start();
  port.entries = { entries: [{ path: "src/a.ts", kind: "file" }, { path: "src", kind: "directory" }], truncated: true };
  const reply = await call(server, "GET", "/api/threads/idle-1/files?q=a");
  assert.deepEqual(reply.json, { entries: port.entries.entries, truncated: true });
  await call(server, "GET", "/api/threads/run-1/files?q=&limit=5");
  assert.deepEqual(port.entriesCalls, [{ cwd: "/work/wt", query: "a", limit: 20 }, { cwd: "/work/root", query: "", limit: 5 }]);
});

test("GET /api/threads/:id/commands gives the provider's commands and skills for the thread's folder", async () => {
  const { server, port } = await start();
  port.config = async () => ({
    providers: [{ instanceId: "a", slashCommands: [{ name: "compact", description: "Summarize" }], workspaceSnapshots: [{ cwd: "/work/wt", slashCommands: [{ name: "compact" }, { name: "local" }], skills: [{ name: "s", path: "/s", enabled: true }] }] }],
  });
  const reply = await call(server, "GET", "/api/threads/idle-1/commands?provider=a");
  assert.deepEqual(reply.json, { commands: [{ name: "compact", description: null }, { name: "local", description: null }], skills: [{ name: "s", displayName: null, description: null }] });
  const global = await call(server, "GET", "/api/threads/unknown/commands?provider=a");
  assert.deepEqual(global.json, { commands: [{ name: "compact", description: "Summarize" }], skills: [] });
});

test("GET /api/threads/:id/commands needs a provider", async () => {
  const { server } = await start();
  for (const query of ["", "?provider=", `?provider=${"x".repeat(201)}`]) assert.equal((await call(server, "GET", `/api/threads/idle-1/commands${query}`)).status, 400, query);
});

test("GET /api/threads/:id/files is empty when T3 names no folder, and refuses a bad query", async () => {
  const { server, port } = await start();
  const reply = await call(server, "GET", "/api/threads/unknown/files?q=a");
  assert.deepEqual(reply.json, { entries: [], truncated: false });
  for (const query of [`q=${"q".repeat(257)}`, "q=a&limit=0", "q=a&limit=51", "q=a&limit=x", "q=a&limit="]) {
    assert.equal((await call(server, "GET", `/api/threads/idle-1/files?${query}`)).status, 400, query);
  }
  assert.deepEqual(port.entriesCalls, []);
});

const stashed = (id: string, text = "hello"): StashEntry => ({ id, text, uploads: [], createdAt: "2026-11-03T10:00:00.000Z", threadId: "t-1", threadTitle: "Fix login" });

test("GET /api/stash lists the entries, newest first", async () => {
  const { server } = await start({ stash: [stashed("b"), stashed("a")] });
  assert.deepEqual((await call(server, "GET", "/api/stash")).json, { entries: [stashed("b"), stashed("a")] });
});

test("POST /api/stash stores the draft with an id and a date, and returns what the limit pushed out", async () => {
  const full = Array.from({ length: 20 }, (_, i) => stashed(`old-${i}`));
  const { server, savedStashes } = await start({ stash: full });
  const upload = { type: "file", id: "att-1", name: "a.txt", mimeType: "text/plain", sizeBytes: 3 };
  const reply = await post(server, "/api/stash", { text: "draft", uploads: [upload], threadId: "t-9", threadTitle: "Other" });
  const entry = { id: "stash-1", text: "draft", uploads: [upload], createdAt: "2026-11-04T10:00:00.000Z", threadId: "t-9", threadTitle: "Other" };
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { ok: true, entry, evicted: [full[19]] });
  assert.equal(savedStashes.at(-1)!.length, 20);
  assert.deepEqual(((await call(server, "GET", "/api/stash")).json as { entries: StashEntry[] }).entries[0], entry);
});

test("POST /api/stash refuses an empty draft, a bad upload and a missing thread", async () => {
  const { server, savedStashes } = await start();
  const thread = { threadId: "t-1", threadTitle: "T" };
  assert.equal((await post(server, "/api/stash", { text: "  ", uploads: [], ...thread })).status, 400);
  assert.equal((await post(server, "/api/stash", { text: "x", uploads: [{ id: "a/b" }], ...thread })).status, 400);
  assert.equal((await post(server, "/api/stash", { text: "x", threadTitle: "T" })).status, 400);
  assert.equal((await post(server, "/api/stash", { text: 5, ...thread })).status, 400);
  assert.equal((await post(server, "/api/stash", { text: "x".repeat(100_001), ...thread })).status, 400);
  assert.deepEqual(savedStashes, []);
  assert.equal((await post(server, "/api/stash", { text: "", uploads: [{ type: "file", id: "att-1", name: "a", mimeType: "text/plain", sizeBytes: 1 }], ...thread })).status, 200);
});

test("POST /api/stash/:id/delete removes the entry, then answers 404 for it", async () => {
  const { server } = await start({ stash: [stashed("a"), stashed("b")] });
  assert.equal((await post(server, "/api/stash/a/delete", {})).status, 200);
  assert.deepEqual((await call(server, "GET", "/api/stash")).json, { entries: [stashed("b")] });
  assert.equal((await post(server, "/api/stash/a/delete", {})).status, 404);
});

test("a stash change is broadcast to every open page, and a refused one is not", async () => {
  const { server, events } = await start({ stash: [stashed("a")] });
  await post(server, "/api/stash", { text: "draft", uploads: [], threadId: "t-9", threadTitle: "Other" });
  await post(server, "/api/stash/a/delete", {});
  await post(server, "/api/stash/missing/delete", {});
  await post(server, "/api/stash", { text: " ", uploads: [], threadId: "t-9", threadTitle: "Other" });
  const lists = events.filter((e) => e.type === "stash").map((e) => (e.data as StashEntry[]).map((x) => x.id));
  assert.deepEqual(lists, [["stash-1", "a"], ["stash-1"]]);
});

test("GET /api/seen is null until a baseline is set, then returns the state", async () => {
  assert.deepEqual((await call((await start()).server, "GET", "/api/seen")).json, { seen: null });
  const saved = { since: "2026-01-01T00:00:00Z", seen: { a: "2026-01-02T00:00:00Z" } };
  assert.deepEqual((await call((await start({ seen: saved })).server, "GET", "/api/seen")).json, { seen: saved });
});

test("POST /api/seen sets the baseline once, saves it and broadcasts the full state", async () => {
  const { server, savedSeen, events } = await start();
  assert.deepEqual((await post(server, "/api/seen", { since: "2026-01-01T00:00:00Z" })).json, { ok: true, seen: { since: "2026-01-01T00:00:00Z", seen: {} } });
  // A later baseline changes nothing, but the answer still carries the current state.
  assert.deepEqual((await post(server, "/api/seen", { since: "2026-06-01T00:00:00Z" })).json, { ok: true, seen: { since: "2026-01-01T00:00:00Z", seen: {} } });
  const state = { since: "2026-01-01T00:00:00Z", seen: {} };
  assert.deepEqual(savedSeen, [state]);
  assert.deepEqual(events, [{ type: "seen", data: state }]);
  assert.deepEqual((await call(server, "GET", "/api/seen")).json, { seen: state });
});

test("POST /api/seen marks a thread forward only, and stays silent when nothing changes", async () => {
  const { server, savedSeen, events } = await start({ seen: { since: "2026-01-01T00:00:00Z", seen: {} } });
  await post(server, "/api/seen", { id: "a", at: "2026-01-05T00:00:00Z" });
  await post(server, "/api/seen", { id: "a", at: "2026-01-03T00:00:00Z" });
  await post(server, "/api/seen", { id: "b", at: "2025-12-01T00:00:00Z" });
  assert.deepEqual(savedSeen, [{ since: "2026-01-01T00:00:00Z", seen: { a: "2026-01-05T00:00:00Z" } }]);
  assert.equal(events.length, 1);
});

test("POST /api/seen ignores a mark while there is no baseline", async () => {
  const { server, savedSeen, events } = await start();
  assert.deepEqual((await post(server, "/api/seen", { id: "a", at: "2026-01-05T00:00:00Z" })).json, { ok: true, seen: null });
  assert.deepEqual(savedSeen, []);
  assert.deepEqual(events, []);
});

test("POST /api/seen refuses a body that is neither a mark nor a baseline", async () => {
  const { server, savedSeen, events } = await start();
  const bad = [{}, { id: "a" }, { at: "x" }, { id: "", at: "x" }, { id: 1, at: "x" }, { id: "a".repeat(201), at: "x" }, { since: "" }, { since: 3 }, { since: "x".repeat(65) }, { since: "~" }, { since: "2026-13-45T00:00:00Z" }, { id: "a", at: "~" }];
  for (const body of bad) assert.equal((await post(server, "/api/seen", body)).status, 400, JSON.stringify(body));
  assert.deepEqual(savedSeen, []);
  assert.deepEqual(events, []);
});

const SECRET_PATH = "/api/threads/run-1/secrets/item%201";

test("secret answer: save and decline reach T3, the answer says ok and never echoes the secret", async () => {
  const { server, port } = await start();
  const saved = await post(server, SECRET_PATH, { secret: "dummy-secret" });
  assert.deepEqual([saved.status, saved.json], [200, { ok: true }]);
  assert.equal(saved.text.includes("dummy-secret"), false);
  assert.equal((await post(server, SECRET_PATH, { decline: true })).status, 200);
  assert.deepEqual(port.secretAnswers, [
    { threadId: "run-1", turnItemId: "item 1", answer: { type: "save", secret: "dummy-secret" } },
    { threadId: "run-1", turnItemId: "item 1", answer: { type: "decline" } },
  ]);
});

test("secret answer: refuses a blank, missing, too long or ambiguous secret", async () => {
  const { server, port } = await start();
  const bad = [{}, { secret: "" }, { secret: "   " }, { secret: 3 }, { secret: "x".repeat(8193) }, { decline: false }, { secret: "a", decline: true }];
  for (const body of bad) {
    const reply = await post(server, SECRET_PATH, body);
    assert.equal(reply.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(reply.text.includes("xxxx"), false);
  }
  assert.equal((await post(server, SECRET_PATH, { secret: "x".repeat(8192) })).status, 200);
  assert.equal(port.secretAnswers.length, 1);
});

test("secret answer: T3 reasons become 404, 409 and 502, without the secret", async () => {
  const { server, port } = await start();
  const cases: Array<[string, number]> = [["not_found", 404], ["already_answered", 409], ["agent_stopped", 409], ["store_failed", 502]];
  for (const [reason, status] of cases) {
    port.secretError = new IntegrationError(`T3 could not take the secret (${reason})`, { system: "t3", kind: "refused", reason });
    const reply = await post(server, SECRET_PATH, { secret: "dummy-secret" });
    assert.equal(reply.status, status, reason);
    assert.equal(reply.text.includes("dummy-secret"), false);
  }
});

test("GET /api/server-stats returns the machine's stats", async () => {
  const { server } = await start();
  const reply = await call(server, "GET", "/api/server-stats");
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, SERVER_STATS);
});

test("GET /api/cache-cleanup lists the reclaimable size per target without clearing", async () => {
  const { server, cleanupCalls } = await start();
  const reply = await call(server, "GET", "/api/cache-cleanup");
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, CACHE_PREVIEW);
  assert.deepEqual(cleanupCalls, ["sizes"]);
});

test("POST /api/cache-cleanup clears and answers the freed bytes per target", async () => {
  const { server, cleanupCalls } = await start();
  const reply = await post(server, "/api/cache-cleanup", { path: "/home" });
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, CACHE_RESULT);
  assert.deepEqual(cleanupCalls, ["clear"]);
});

test("POST /api/cache-cleanup answers an error when the cleanup itself fails", async () => {
  const { server } = await start({ cleanupError: new Error("disk gone") });
  assert.equal((await post(server, "/api/cache-cleanup")).status, 500);
});

test("GET /api/folders answers the suggestions and the kind of the path", async () => {
  const { server, port } = await start();
  port.browseResult = { parentPath: "/work", entries: [{ name: "root", fullPath: "/work/root" }] };
  port.kinds = [null];
  const reply = await call(server, "GET", `/api/folders?path=${encodeURIComponent(" /work/ro ")}`);
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, { path: "/work/ro", kind: "missing", entries: [{ name: "root", path: "/work/root" }] });
  assert.deepEqual(port.browseCalls, ["/work/ro"]);
});

test("GET /api/folders validates the path and maps a T3 failure to 502", async () => {
  const { server, port } = await start();
  const message = "path must be an absolute folder path (/… or ~/…), up to 512 characters";
  for (const path of ["", "   ", "src/x", "~other", "/a\u0000b", `/${"a".repeat(512)}`]) {
    const reply = await call(server, "GET", `/api/folders?path=${encodeURIComponent(path)}`);
    assert.deepEqual([reply.status, reply.json?.error], [400, message], JSON.stringify(path));
  }
  assert.equal((await call(server, "GET", "/api/folders")).status, 400);
  assert.deepEqual(port.browseCalls, []);
  port.browseError = new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" });
  assert.equal((await call(server, "GET", "/api/folders?path=%2Fwork")).status, 502);
});

test("POST /api/projects creates a project from a folder", async () => {
  const { server, port } = await start();
  const reply = await post(server, "/api/projects", { path: " /home/demo/new-app/ ", title: "  " });
  assert.deepEqual([reply.status, reply.json], [200, { ok: true, projectId: "id-1", created: true }]);
  assert.deepEqual(port.mutations[0]!.mutation, { type: "project.create", projectId: "id-1", title: "new-app", workspaceRoot: "/home/demo/new-app", createWorkspaceRootIfMissing: true });
});

test("POST /api/projects reuses the project that has the folder", async () => {
  const { server, port } = await start();
  const reply = await post(server, "/api/projects", { path: "/work/root/", title: "Other" });
  assert.deepEqual(reply.json, { ok: true, projectId: "project-1", created: false });
  assert.deepEqual(port.mutations, []);
});

test("POST /api/projects/:id/update sends the changed fields and uppercases a monogram", async () => {
  const { server, port } = await start();
  const reply = await post(server, "/api/projects/project-1/update", { title: " New name ", path: "/work/other", icon: { kind: "monogram", text: " ab ", color: "teal" } });
  assert.deepEqual([reply.status, reply.json], [200, { ok: true }]);
  assert.deepEqual(port.mutations[0]!.mutation, { type: "project.update", projectId: "project-1", title: "New name", workspaceRoot: "/work/other", projectIcon: { kind: "monogram", text: "AB", color: "teal" } });
  await post(server, "/api/projects/project-1/update", { icon: null });
  assert.deepEqual(port.mutations[1]!.mutation, { type: "project.update", projectId: "project-1", projectIcon: null });
});

test("POST /api/projects/:id/update validates its body and maps errors", async () => {
  const { server, port } = await start();
  const lucide = { kind: "lucide", name: "rocket", color: "blue" };
  const bad: Array<[unknown, string]> = [
    [{}, "give a title, a path or an icon"],
    [{ title: " " }, "title must be 1 to 200 characters"],
    [{ title: 3 }, "title must be 1 to 200 characters"],
    [{ title: "t".repeat(201) }, "title must be 1 to 200 characters"],
    [{ path: "relative" }, "path must be an absolute folder path (/… or ~/…), up to 512 characters"],
    [{ icon: "rocket" }, "icon is not a valid project icon"],
    [{ icon: { ...lucide, color: "pink-ish" } }, "icon is not a valid project icon"],
    [{ icon: { ...lucide, name: "Rocket" } }, "icon is not a valid project icon"],
    [{ icon: { ...lucide, name: "a".repeat(65) } }, "icon is not a valid project icon"],
    [{ icon: { kind: "monogram", text: "ABC", color: "blue" } }, "icon is not a valid project icon"],
    [{ icon: { kind: "monogram", text: "A!", color: "blue" } }, "icon is not a valid project icon"],
    [{ icon: { kind: "monogram", text: "aß", color: "blue" } }, "icon is not a valid project icon"],
    [{ icon: { kind: "monogram", text: " ", color: "blue" } }, "icon is not a valid project icon"],
    [{ icon: { kind: "monogram", text: "A" } }, "icon is not a valid project icon"],
    [{ icon: { kind: "emoji", emoji: " " } }, "icon is not a valid project icon"],
    [{ icon: { kind: "emoji", emoji: "x".repeat(33) } }, "icon is not a valid project icon"],
    [{ icon: { kind: "other" } }, "icon is not a valid project icon"],
  ];
  for (const [body, error] of bad) {
    const reply = await post(server, "/api/projects/project-1/update", body);
    assert.deepEqual([reply.status, reply.json?.error], [400, error], JSON.stringify(body));
  }
  assert.deepEqual(port.mutations, []);
  assert.equal((await post(server, "/api/projects/nope/update", { title: "x" })).status, 404);
  const refuse = (reason: string) => new IntegrationError("T3 says no", { system: "t3", kind: "refused", reason });
  for (const [reason, status] of [["WorkspaceRootNotExistsError", 400], ["WorkspaceRootNotDirectoryError", 400], ["ProjectConflictError", 409], ["ProjectNotFoundError", 404]] as const) {
    port.mutateError = refuse(reason);
    assert.equal((await post(server, "/api/projects/project-1/update", { title: "x" })).status, status, reason);
  }
});

test("POST /api/projects/:id/delete sends a forced delete", async () => {
  const { server, port } = await start();
  const reply = await post(server, "/api/projects/project-1/delete", {});
  assert.deepEqual([reply.status, reply.json], [200, { ok: true }]);
  assert.deepEqual(port.mutations[0]!.mutation, { type: "project.delete", projectId: "project-1", force: true });
  assert.equal((await post(server, "/api/projects/nope/delete", {})).status, 404);
  assert.equal(port.mutations.length, 1);
});

test("GET /api/project-icons lists the icon presets", async () => {
  const { server } = await start();
  const reply = await call(server, "GET", "/api/project-icons");
  assert.equal(reply.status, 200);
  assert.equal(reply.json?.icons[0].name, "folder-code");
  assert.equal(reply.json?.icons[0].icon.kind, "lucide");
});

test("POST /api/projects validates its body", async () => {
  const { server, port } = await start();
  const bad = [{}, { path: 3 }, { path: "relative" }, { path: "/x", title: 3 }, { path: "/x", title: "t".repeat(201) }];
  for (const body of bad) assert.equal((await post(server, "/api/projects", body)).status, 400, JSON.stringify(body));
  assert.equal((await post(server, "/api/projects", { path: "/x", title: 3 })).json.error, "title must be a string of at most 200 characters");
  assert.deepEqual(port.mutations, []);
});

test("POST /api/projects answers 400, 409 and 502 for T3 refusals", async () => {
  const { server, port } = await start();
  const refuse = (reason?: string) => new IntegrationError("T3 says no", { system: "t3", kind: "refused", ...(reason && { reason }) });
  port.mutateError = refuse("WorkspaceRootNotDirectoryError");
  const file = await post(server, "/api/projects", { path: "/x" });
  assert.deepEqual([file.status, file.json.error], [400, "This path is a file, not a folder"]);
  port.mutateError = refuse("ProjectConflictError");
  const conflict = await post(server, "/api/projects", { path: "/x" });
  assert.deepEqual([conflict.status, conflict.json.error], [409, "Another T3 project already uses this folder"]);
  port.mutateError = refuse();
  const other = await post(server, "/api/projects", { path: "/x" });
  assert.deepEqual([other.status, other.json.error], [502, "T3 says no"]);
});

const newsBody = { enabled: false, frequency: "weekly", weekday: 0, timeOfDay: "06:45", language: "French", modelSelection: model };

test("GET /api/news returns the news state, and GET /api/news/:date one article", async () => {
  const { server } = await start();
  assert.deepEqual((await call(server, "GET", "/api/news")).json, newsState);
  assert.deepEqual((await call(server, "GET", "/api/news/2026-11-07")).json, { date: "2026-11-07", title: "T", markdown: "# T" });
});

test("GET /api/news/:date maps a bad date to 400 and a missing article to 404", async () => {
  const article = async (date: string) => {
    if (date === "2026-11-01") throw new DomainError("not-found", "No article for this date");
    throw new DomainError("invalid", "The date must look like 2026-11-07");
  };
  const { server } = await start({ news: { article } });
  assert.equal((await call(server, "GET", "/api/news/2026-11-01")).status, 404);
  assert.equal((await call(server, "GET", "/api/news/..%2Fsecret")).status, 400);
});

test("POST /api/news/:date/delete removes one article and maps errors", async () => {
  const removed: string[] = [];
  const remove = async (date: string) => {
    if (date === "2026-11-01") throw new DomainError("not-found", "No article for this date");
    if (date === "nope") throw new DomainError("invalid", "The date must look like 2026-11-07");
    removed.push(date);
  };
  const { server } = await start({ news: { remove } });
  const reply = await post(server, "/api/news/2026-11-07/delete", {});
  assert.deepEqual([reply.status, reply.json], [200, { ok: true }]);
  assert.deepEqual(removed, ["2026-11-07"]);
  assert.equal((await post(server, "/api/news/2026-11-01/delete", {})).status, 404);
  assert.equal((await post(server, "/api/news/nope/delete", {})).status, 400);
});

test("POST /api/news/delete-all is not taken for a date, and returns the count", async () => {
  const removed: string[] = [];
  const { server } = await start({ news: { remove: async (date) => void removed.push(date), removeAll: async () => 3 } });
  const reply = await post(server, "/api/news/delete-all", {});
  assert.deepEqual([reply.status, reply.json], [200, { ok: true, removed: 3 }]);
  assert.deepEqual(removed, []);
});

test("POST /api/news/settings keeps the options of the model selection", async () => {
  const saved: unknown[] = [];
  const { server } = await start({ news: { save: async (body) => (saved.push(body), newsState) } });
  const modelSelection = { ...model, options: [{ id: "reasoningEffort", value: "high" }] };
  await post(server, "/api/news/settings", { ...newsBody, modelSelection });
  assert.deepEqual((saved[0] as { modelSelection: unknown }).modelSelection, modelSelection);
});

test("POST /api/news/settings validates the body and saves the clean settings", async () => {
  const saved: unknown[] = [];
  const { server } = await start({ news: { save: async (body) => (saved.push(body), newsState) } });
  const reply = await post(server, "/api/news/settings", newsBody);
  assert.equal(reply.status, 200);
  assert.deepEqual(reply.json, newsState);
  assert.deepEqual(saved, [{ enabled: false, frequency: "weekly", weekday: 0, timeOfDay: "06:45", language: "French", modelSelection: model }]);
  const bad: unknown[] = [
    {},
    { ...newsBody, timeOfDay: "7:00" },
    { ...newsBody, timeOfDay: "24:00" },
    { ...newsBody, language: "" },
    { ...newsBody, language: "German" },
    { ...newsBody, language: "french" },
    { ...newsBody, language: undefined },
    { ...newsBody, enabled: undefined },
    { ...newsBody, enabled: "yes" },
    { ...newsBody, frequency: "monthly" },
    { ...newsBody, frequency: undefined },
    { ...newsBody, weekday: 7 },
    { ...newsBody, weekday: -1 },
    { ...newsBody, weekday: 1.5 },
    { ...newsBody, weekday: "1" },
    { ...newsBody, modelSelection: null },
    { ...newsBody, modelSelection: { instanceId: "a" } },
  ];
  for (const body of bad) assert.equal((await post(server, "/api/news/settings", body)).status, 400, JSON.stringify(body));
  assert.equal(saved.length, 1);
  // An old client may still send topics: they are ignored.
  const old = await post(server, "/api/news/settings", { ...newsBody, topics: ["AI"] });
  assert.equal(old.status, 200);
  assert.ok(!("topics" in (saved[1] as object)));
});

test("POST /api/news/settings maps a T3 failure to 502", async () => {
  const { server } = await start({ news: { save: async () => { throw new IntegrationError("T3 is down", { system: "t3", kind: "unreachable" }); } } });
  assert.equal((await post(server, "/api/news/settings", newsBody)).status, 502);
});

test("POST /api/news/run starts the run, and says to save first when there is no task", async () => {
  const { server } = await start();
  assert.deepEqual((await post(server, "/api/news/run")).json, { ok: true });
  const missing = await start({ news: { runNow: async () => { throw new DomainError("not-found", "Save the News settings first"); } } });
  const reply = await post(missing.server, "/api/news/run");
  assert.equal(reply.status, 404);
  assert.match(reply.text, /Save the News settings first/);
});
