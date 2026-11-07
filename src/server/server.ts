import type { Server } from "bun";
import type { ConnectionStatus, DashboardState } from "../../shared/api.ts";
import { MAX_MESSAGE_BODY_BYTES, MAX_UPLOAD_BODY_BYTES } from "../../shared/limits.ts";
import type { Actions, AssetRequest } from "../domain/actions.ts";
import type { SessionsStore } from "../domain/sessionsStore.ts";
import type { StashStore } from "../domain/stashStore.ts";
import type { SeenStore } from "../domain/seenStore.ts";
import type { CacheCleanup } from "../domain/cacheCleanup.ts";
import type { Automations } from "../domain/automations.ts";
import type { LinearBoard } from "../domain/linearBoard.ts";
import type { ProviderLimitsReader } from "../domain/providerLimits.ts";
import type { ServerStatsReader } from "../domain/serverStats.ts";
import type { Usage } from "../domain/usage.ts";
import type { Settings } from "../domain/settings.ts";
import type { UpdateManager } from "../domain/updates.ts";
import { VERSION } from "../config/version.ts";
import { HttpError, toHttp } from "./httpError.ts";
import { isPageTheme, themedPage } from "./htmlRender.ts";
import { matchesEtag } from "./etag.ts";
import { servePwa } from "./pwa.ts";
import type { Site } from "./site.ts";
import type { SseHub } from "./sse.ts";
import { isObject } from "../../shared/guards.ts";
import { isText, validActivityPeriod, validAssign, validAttachments, validCreateAutomation, validCreate, validCreateProject, validEnabled, validUpdateProject, validFolderPath, validFileSearch, validItemId, validMessage, validProvider, validQueuedEdit, validRespond, validRewind, validSearch, validSecretAnswer, validSeen, validSessions, validSettings, validStash, validTimeZone, validUpdateAutomation, validUpload } from "./validate.ts";

export interface SetupControl {
  /** Resolves the token again. */
  refresh(): Promise<void>;
  paste(token: string): Promise<"ok" | "rejected" | "unreachable" | "locked">;
  /** Reconnects to T3 now, without waiting for the backoff. */
  wake(): void;
}

export interface DashboardServerOptions {
  actions: Actions;
  board: Pick<LinearBoard, "get">;
  usage: Pick<Usage, "get">;
  limits: Pick<ProviderLimitsReader, "get">;
  serverStats: Pick<ServerStatsReader, "get">;
  cacheCleanup: Pick<CacheCleanup, "sizes" | "clear">;
  automations: Pick<Automations, "list" | "create" | "remove" | "update" | "setEnabled" | "runNow">;
  sessions: Pick<SessionsStore, "get" | "set">;
  stash: Pick<StashStore, "list" | "add" | "remove">;
  seen: Pick<SeenStore, "get" | "apply">;
  hub: SseHub;
  getState: () => DashboardState;
  connection: () => ConnectionStatus;
  site: Site;
  settings: Settings;
  setup: SetupControl;
  updates: Pick<UpdateManager, "status" | "check" | "apply">;
  /** Lowercase hostnames, without port, accepted besides 127.0.0.1 and localhost. */
  allowedHosts?: string[];
}

const MAX_BODY_BYTES = 1024 * 1024;
// The first usage read walks every recent thread: it can stay silent longer than Bun's 10 s idle default.
const USAGE_IDLE_TIMEOUT_S = 60;
// Scanning or removing GBs of small files takes longer than Bun's 10 s idle limit.
const CACHE_CLEANUP_IDLE_TIMEOUT_S = 300;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};


// ?inline=1 frames these in the preview dialog. A PDF cannot be sandboxed: Chrome's viewer would not load.
const PDF_TYPE = /^application\/pdf\s*(;|$)/i;
const TEXT_TYPE = /^(text\/[\w.+-]+|application\/json)\s*(;|$)/i;
const MEDIA_TYPE = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm|quicktime))\s*(;|$)/i;

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

function checkOrigin(req: Request, allowed: ReadonlySet<string>): void {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const hostOk = host !== null && allowed.has(hostnameOf(host) ?? "");
  const originOk = origin === null || allowed.has(hostnameOf(origin) ?? "");
  if (!hostOk || !originOk) throw new HttpError(403, "Forbidden host or origin");
}

async function readJson(req: Request, maxBytes = MAX_BODY_BYTES): Promise<Record<string, unknown>> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(400, "content-type must be application/json");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    for await (const chunk of req.body) {
      size += chunk.length;
      if (size > maxBytes) throw new HttpError(413, `Body over ${maxBytes / (1024 * 1024)} MB`);
      chunks.push(chunk);
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (text === "") return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "Body is not valid JSON");
  }
  if (!isObject(parsed)) throw new HttpError(400, "Body must be a JSON object");
  return parsed;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });

// A weak etag of the exact body lets the client poll without downloading an unchanged thread.
function threadResponse(req: Request, detail: unknown): Response {
  const body = JSON.stringify(detail);
  const etag = `W/"${Bun.hash(body).toString(36)}"`;
  const headers = { etag, "cache-control": "no-cache" };
  if (matchesEtag(req.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", ...headers } });
}

export interface DashboardHandler {
  fetch(req: Request, server?: Server<undefined>): Promise<Response>;
}

interface RouteContext {
  req: Request;
  server: Server<undefined> | undefined;
  params: Record<string, string>;
  body: Record<string, unknown>;
}

interface Route {
  method: "GET" | "POST";
  path: string;
  /** Body limit of a POST; 1 MB by default. */
  maxBytes?: number;
  handle(ctx: RouteContext): Promise<Response> | Response;
}

// `:name` matches one non-empty segment.
function matchRoute(pattern: string[], segments: string[]): Record<string, string> | null {
  if (pattern.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (const [index, part] of pattern.entries()) {
    const segment = segments[index]!;
    if (part.startsWith(":") && segment !== "") params[part.slice(1)] = segment;
    else if (part !== segment) return null;
  }
  return params;
}

export function createDashboardServer(options: DashboardServerOptions): DashboardHandler {
  const { actions, sessions, stash, seen, hub, board, usage, limits, serverStats, cacheCleanup, automations, getState, connection, site, settings, setup, updates } = options;
  const allowedHosts = new Set([...LOCAL_HOSTS, ...(options.allowedHosts ?? [])]);
  const ok = (extra: Record<string, unknown> = {}) => json(200, { ok: true, ...extra });
  const done = async (work: Promise<unknown>) => (await work, ok());

  // Images keep T3's type; a rendered page is served sandboxed, so its scripts get an opaque origin and cannot call /api.
  async function asset(req: Request, threadId: string, request: AssetRequest): Promise<Response> {
    const { response, html } = await actions.asset(threadId, request, req.headers.get("range") ?? undefined);
    const headers: Record<string, string> = { "cache-control": "private, max-age=3600" };
    // ?raw=1 asks for the bytes: a user's .html file is a download, not a page to render.
    const params = new URL(req.url).searchParams;
    if (!html || params.get("raw") === "1") {
      // Never pass through a type the browser could run (html, svg) on the dashboard origin.
      const type = response.headers.get("content-type") ?? "";
      const inline = params.get("inline") === "1" && params.get("raw") !== "1";
      if (MEDIA_TYPE.test(type)) headers["content-type"] = type;
      else if (inline && PDF_TYPE.test(type)) Object.assign(headers, { "content-type": "application/pdf", "content-security-policy": "frame-ancestors 'self'" });
      else if (inline && TEXT_TYPE.test(type)) Object.assign(headers, { "content-type": "text/plain; charset=utf-8", "content-security-policy": "sandbox; frame-ancestors 'self'" });
      else Object.assign(headers, { "content-type": "application/octet-stream", "content-disposition": "attachment" });
      // Videos play by byte ranges: Safari refuses one without them.
      for (const name of ["content-range", "accept-ranges", "content-length"]) {
        const value = response.headers.get(name);
        if (value) headers[name] = value;
      }
      return new Response(response.body, { status: response.status, headers });
    }
    const theme = params.get("theme");
    headers["content-type"] = "text/html; charset=utf-8";
    headers["content-security-policy"] = "sandbox allow-scripts allow-popups; frame-ancestors 'self'";
    return new Response(themedPage(await response.text(), isPageTheme(theme) ? theme : "light"), { headers });
  }

  const routes: Route[] = [
    { method: "GET", path: "/api/health", handle: () => json(200, { ok: true, t3: connection().t3, version: VERSION }) },
    { method: "GET", path: "/api/board", handle: async ({ req }) => json(200, await board.get(new URL(req.url).searchParams.get("refresh") === "1")) },
    {
      method: "GET",
      path: "/api/usage",
      handle: async ({ req, server }) => {
        server?.timeout(req, USAGE_IDLE_TIMEOUT_S);
        const params = new URL(req.url).searchParams;
        return json(200, await usage.get(validTimeZone(params.get("tz")), validActivityPeriod(params.get("period")), params.get("refresh") === "1"));
      },
    },
    { method: "GET", path: "/api/server-stats", handle: async () => json(200, await serverStats.get()) },
    {
      method: "GET",
      path: "/api/cache-cleanup",
      handle: async ({ req, server }) => {
        server?.timeout(req, CACHE_CLEANUP_IDLE_TIMEOUT_S);
        return json(200, await cacheCleanup.sizes());
      },
    },
    { method: "GET", path: "/api/limits", handle: async ({ req }) => json(200, await limits.get(new URL(req.url).searchParams.get("refresh") === "1")) },
    { method: "GET", path: "/api/automations", handle: async () => json(200, await automations.list()) },
    { method: "GET", path: "/api/settings", handle: () => json(200, settings.get()) },
    { method: "GET", path: "/api/sessions", handle: () => json(200, { sessions: sessions.get() }) },
    { method: "GET", path: "/api/stash", handle: () => json(200, { entries: stash.list() }) },
    { method: "GET", path: "/api/seen", handle: () => json(200, { seen: seen.get() }) },
    { method: "GET", path: "/api/update", handle: () => json(200, updates.status()) },
    {
      method: "GET",
      path: "/api/events",
      handle: ({ req, server }) => {
        server?.timeout(req, 0);
        return hub.add(getState(), req.signal);
      },
    },
    {
      method: "GET",
      path: "/api/search",
      handle: async ({ req }) => {
        const { query, limit } = validSearch(new URL(req.url).searchParams);
        return json(200, await actions.searchThreads(query, limit));
      },
    },
    { method: "GET", path: "/api/folders", handle: async ({ req }) => json(200, await actions.browseFolders(validFolderPath(new URL(req.url).searchParams))) },
    { method: "GET", path: "/api/threads/:id", handle: async ({ req, params }) => threadResponse(req, await actions.threadDetail(params.id!)) },
    { method: "GET", path: "/api/threads/:id/items/:itemId", handle: async ({ params }) => json(200, await actions.stepDetail(params.id!, validItemId(params.itemId!))) },
    {
      method: "GET",
      path: "/api/threads/:id/files",
      handle: async ({ req, params }) => {
        const { query, limit } = validFileSearch(new URL(req.url).searchParams);
        return json(200, await actions.searchFiles(params.id!, query, limit));
      },
    },
    { method: "GET", path: "/api/threads/:id/commands", handle: async ({ req, params }) => json(200, await actions.composerCommands(params.id!, validProvider(new URL(req.url).searchParams))) },
    { method: "GET", path: "/api/threads/:id/attachments/:attachmentId", handle: ({ req, params }) => asset(req, params.id!, { attachmentId: params.attachmentId! }) },
    {
      method: "GET",
      path: "/api/threads/:id/media",
      handle: ({ req, params }) => {
        const path = new URL(req.url).searchParams.get("path");
        if (!path) throw new HttpError(400, "Missing path");
        return asset(req, params.id!, { path });
      },
    },
    {
      method: "POST",
      path: "/api/board/assign",
      maxBytes: MAX_MESSAGE_BODY_BYTES,
      handle: async ({ body }) => {
        const assign = validAssign(body);
        const { images, uploads } = validAttachments(body);
        return ok({ threadId: await actions.assign(assign, images, uploads) });
      },
    },
    {
      method: "POST",
      path: "/api/setup/retry",
      handle: async () => {
        await setup.refresh();
        setup.wake();
        return json(200, connection());
      },
    },
    {
      method: "POST",
      path: "/api/setup/token",
      handle: async ({ body }) => {
        if (!isText(body.token)) throw new HttpError(400, "Paste a token first.");
        const result = await setup.paste(body.token);
        if (result === "locked") throw new HttpError(409, "T3_DASHBOARD_TOKEN_FILE is set: put the token in that file.");
        if (result === "rejected") throw new HttpError(400, "T3 Code refused this token.");
        if (result === "unreachable") throw new HttpError(502, "T3 Code is unreachable.");
        setup.wake();
        return json(200, connection());
      },
    },
    {
      method: "POST",
      path: "/api/sessions",
      handle: ({ body }) => {
        const update = validSessions(body);
        sessions.set(update.sessions);
        hub.broadcast({ type: "sessions", data: update });
        return ok();
      },
    },
    // No body field is read: the server alone decides what is cleared.
    {
      method: "POST",
      path: "/api/cache-cleanup",
      handle: async ({ req, server }) => {
        server?.timeout(req, CACHE_CLEANUP_IDLE_TIMEOUT_S);
        return json(200, await cacheCleanup.clear());
      },
    },
    {
      method: "POST",
      path: "/api/stash",
      handle: ({ body }) => {
        const added = stash.add(validStash(body));
        hub.broadcast({ type: "stash", data: stash.list() });
        return ok(added);
      },
    },
    {
      method: "POST",
      path: "/api/stash/:id/delete",
      handle: ({ params }) => {
        if (!stash.remove(params.id!)) throw new HttpError(404, "This stashed prompt is gone already");
        hub.broadcast({ type: "stash", data: stash.list() });
        return ok();
      },
    },
    {
      method: "POST",
      path: "/api/seen",
      handle: ({ body }) => {
        const next = seen.apply(validSeen(body));
        if (next) hub.broadcast({ type: "seen", data: next });
        return ok({ seen: seen.get() });
      },
    },
    { method: "POST", path: "/api/update/check", handle: async () => json(200, await updates.check()) },
    {
      method: "POST",
      path: "/api/update/apply",
      handle: () => {
        const result = updates.apply();
        if (!result.started) throw new HttpError(409, result.reason);
        return json(202, updates.status());
      },
    },
    { method: "POST", path: "/api/settings/linear/key", handle: async ({ body }) => json(200, await settings.connectKey({ apiKey: String(body.apiKey ?? "") })) },
    { method: "POST", path: "/api/settings/linear/disconnect", handle: () => json(200, settings.disconnect()) },
    { method: "POST", path: "/api/automations", handle: async ({ body }) => json(200, await automations.create(validCreateAutomation(body))) },
    { method: "POST", path: "/api/automations/:id/update", handle: ({ params, body }) => done(automations.update(params.id!, validUpdateAutomation(body))) },
    { method: "POST", path: "/api/automations/:id/enabled", handle: ({ params, body }) => done(automations.setEnabled(params.id!, validEnabled(body))) },
    { method: "POST", path: "/api/automations/:id/run", handle: ({ params }) => done(automations.runNow(params.id!)) },
    { method: "POST", path: "/api/automations/:id/delete", handle: ({ params }) => done(automations.remove(params.id!)) },
    { method: "GET", path: "/api/project-icons", handle: () => json(200, actions.projectIcons()) },
    { method: "POST", path: "/api/projects/:id/update", handle: ({ params, body }) => done(actions.updateProject(params.id!, validUpdateProject(body))) },
    { method: "POST", path: "/api/projects/:id/delete", handle: ({ params }) => done(actions.deleteProject(params.id!)) },
    { method: "POST", path: "/api/projects", handle: async ({ body }) => ok(await actions.createProject(validCreateProject(body))) },
    {
      method: "POST",
      path: "/api/threads",
      maxBytes: MAX_MESSAGE_BODY_BYTES,
      handle: async ({ body }) => {
        const create = validCreate(body);
        const { images, uploads } = validAttachments(body);
        return ok({ threadId: await actions.createThread(create, images, uploads) });
      },
    },
    { method: "POST", path: "/api/attachments", maxBytes: MAX_UPLOAD_BODY_BYTES, handle: async ({ body }) => ok({ attachment: await actions.uploadAttachment(validUpload(body)) }) },
    { method: "POST", path: "/api/attachments/:attachmentId/delete", handle: ({ params }) => done(actions.deleteAttachment(params.attachmentId!)) },
    {
      method: "POST",
      path: "/api/threads/:id/messages",
      maxBytes: MAX_MESSAGE_BODY_BYTES,
      handle: async ({ params, body }) => {
        const { message, images, uploads } = validMessage(body);
        await actions.sendMessage(params.id!, message, images, uploads);
        return ok();
      },
    },
    { method: "POST", path: "/api/threads/:id/settings", handle: ({ params, body }) => done(actions.changeSettings(params.id!, validSettings(body))) },
    { method: "POST", path: "/api/threads/:id/settle", handle: ({ params }) => done(actions.settle(params.id!)) },
    { method: "POST", path: "/api/threads/:id/unsettle", handle: ({ params }) => done(actions.unsettle(params.id!)) },
    {
      method: "POST",
      path: "/api/threads/:id/rewind",
      handle: ({ params, body }) => {
        const { messageId, restoreFiles } = validRewind(body);
        return done(actions.rewind(params.id!, messageId, restoreFiles));
      },
    },
    { method: "POST", path: "/api/threads/:id/interrupt", handle: ({ params }) => done(actions.interrupt(params.id!)) },
    { method: "POST", path: "/api/threads/:id/queue/:runId/send", handle: ({ params }) => done(actions.sendQueued(params.id!, params.runId!)) },
    { method: "POST", path: "/api/threads/:id/queue/:runId/edit", handle: ({ params, body }) => done(actions.editQueued(params.id!, params.runId!, validQueuedEdit(body))) },
    { method: "POST", path: "/api/threads/:id/queue/:runId/cancel", handle: ({ params }) => done(actions.cancelQueued(params.id!, params.runId!)) },
    { method: "POST", path: "/api/threads/:id/subagents/:subagentId/stop", handle: ({ params }) => done(actions.stopSubagent(params.id!, params.subagentId!)) },
    {
      method: "POST",
      path: "/api/threads/:id/requests/:requestId/respond",
      handle: ({ params, body }) => done(actions.respond(params.id!, params.requestId!, validRespond(body))),
    },
    { method: "POST", path: "/api/threads/:id/secrets/:itemId", handle: ({ params, body }) => done(actions.answerSecret(params.id!, params.itemId!, validSecretAnswer(body))) },
    { method: "POST", path: "/api/threads/:id/requests/:requestId/dismiss", handle: ({ params }) => done(actions.dismiss(params.id!, params.requestId!)) },
  ];
  const table = routes.map((route) => ({ ...route, pattern: route.path.split("/").slice(1) }));

  async function api(req: Request, server: Server<undefined> | undefined, segments: string[]): Promise<Response> {
    for (const route of table) {
      if (route.method !== req.method) continue;
      const params = matchRoute(route.pattern, segments);
      if (!params) continue;
      // Every POST goes through readJson: its JSON content-type check is the CSRF guard.
      const body = route.method === "POST" ? await readJson(req, route.maxBytes) : {};
      return route.handle({ req, server, params, body });
    }
    throw new HttpError(404, "Unknown route");
  }

  async function handle(req: Request, server: Server<undefined> | undefined): Promise<Response> {
    checkOrigin(req, allowedHosts);
    let segments: string[];
    let pathname: string;
    try {
      pathname = new URL(req.url).pathname;
      segments = pathname.split("/").slice(1).map(decodeURIComponent);
    } catch {
      throw new HttpError(400, "Malformed URL");
    }
    if (segments[0] === "api") return api(req, server, segments);
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(404, "Unknown route");
    if (pathname.includes("\0")) throw new HttpError(400, "Malformed URL");
    return servePwa(pathname) ?? (await site.serve(pathname, req)) ?? json(404, { error: "Unknown route" });
  }

  return {
    async fetch(req, server) {
      let response: Response;
      try {
        response = await handle(req, server);
      } catch (error) {
        const http = toHttp(error);
        if (!http) console.error(error);
        const { status, message } = http ?? { status: 500, message: "Internal error" };
        response = json(status, { error: message }, status === 413 ? { connection: "close" } : undefined);
      }
      // Forbids framing: a hostile page could otherwise clickjack the approval buttons.
      // A sandboxed page allows framing by the dashboard itself: its own CSP replaces the default.
      const framable = response.headers.get("content-security-policy")?.includes("frame-ancestors 'self'");
      const secured = (headers: Headers) => {
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
          if (framable && name !== "x-content-type-options") continue;
          headers.set(name, value);
        }
        if (framable) headers.set("x-frame-options", "SAMEORIGIN");
        return headers;
      };
      // Setting in place keeps Bun's fast path for known-length bodies; a response with immutable headers is copied.
      try {
        secured(response.headers);
        return response;
      } catch {
        return new Response(response.body, { status: response.status, statusText: response.statusText, headers: secured(new Headers(response.headers)) });
      }
    },
  };
}
