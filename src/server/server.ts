import type { Server } from "bun";
import type { AutomationsResult, ConnectionStatus, DashboardState } from "../../shared/api.ts";
import { MAX_MESSAGE_BODY_BYTES } from "../../shared/limits.ts";
import type { Actions, AssetRequest } from "../domain/actions.ts";
import type { LinearBoard } from "../domain/linearBoard.ts";
import type { Settings } from "../domain/settings.ts";
import type { UpdateManager } from "../domain/updates.ts";
import { VERSION } from "../config/version.ts";
import { HttpError, toHttp } from "./httpError.ts";
import { isPageTheme, themedPage } from "./htmlRender.ts";
import { servePwa } from "./pwa.ts";
import type { Site } from "./site.ts";
import type { SseHub } from "./sse.ts";
import { isObject, isText, validAssign, validCreate, validImages, validMessage, validRespond, validSearch, validSettings } from "./validate.ts";

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
  automations: () => AutomationsResult;
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
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};


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
  const { actions, hub, board, automations, getState, connection, site, settings, setup, updates } = options;
  const allowedHosts = new Set([...LOCAL_HOSTS, ...(options.allowedHosts ?? [])]);
  const ok = (extra: Record<string, unknown> = {}) => json(200, { ok: true, ...extra });
  const done = async (work: Promise<unknown>) => (await work, ok());

  // Images keep T3's type; a page is served sandboxed, so its scripts get an opaque origin and cannot call /api.
  async function asset(req: Request, threadId: string, request: AssetRequest): Promise<Response> {
    const { response, html } = await actions.asset(threadId, request, req.headers.get("range") ?? undefined);
    const headers: Record<string, string> = { "cache-control": "private, max-age=3600" };
    if (!html) {
      // Never pass through a type the browser could run (html, svg) on the dashboard origin.
      const type = response.headers.get("content-type") ?? "";
      if (MEDIA_TYPE.test(type)) headers["content-type"] = type;
      else Object.assign(headers, { "content-type": "application/octet-stream", "content-disposition": "attachment" });
      // Videos play by byte ranges: Safari refuses one without them.
      for (const name of ["content-range", "accept-ranges", "content-length"]) {
        const value = response.headers.get(name);
        if (value) headers[name] = value;
      }
      return new Response(response.body, { status: response.status, headers });
    }
    const theme = new URL(req.url).searchParams.get("theme");
    headers["content-type"] = "text/html; charset=utf-8";
    headers["content-security-policy"] = "sandbox allow-scripts allow-popups; frame-ancestors 'self'";
    return new Response(themedPage(await response.text(), isPageTheme(theme) ? theme : "light"), { headers });
  }

  const routes: Route[] = [
    { method: "GET", path: "/api/health", handle: () => json(200, { ok: true, t3: connection().t3, version: VERSION }) },
    { method: "GET", path: "/api/board", handle: async ({ req }) => json(200, await board.get(new URL(req.url).searchParams.get("refresh") === "1")) },
    { method: "GET", path: "/api/automations", handle: () => json(200, automations()) },
    { method: "GET", path: "/api/settings", handle: () => json(200, settings.get()) },
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
    { method: "GET", path: "/api/threads/:id", handle: async ({ params }) => json(200, await actions.threadDetail(params.id!)) },
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
      handle: async ({ body }) => ok({ threadId: await actions.assign(validAssign(body), validImages(body.attachments)) }),
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
    {
      method: "POST",
      path: "/api/threads",
      maxBytes: MAX_MESSAGE_BODY_BYTES,
      handle: async ({ body }) => ok({ threadId: await actions.createThread(validCreate(body), validImages(body.attachments)) }),
    },
    {
      method: "POST",
      path: "/api/threads/:id/messages",
      maxBytes: MAX_MESSAGE_BODY_BYTES,
      handle: async ({ params, body }) => {
        const { message, images } = validMessage(body);
        await actions.sendMessage(params.id!, message, images);
        return ok();
      },
    },
    { method: "POST", path: "/api/threads/:id/settings", handle: ({ params, body }) => done(actions.changeSettings(params.id!, validSettings(body))) },
    { method: "POST", path: "/api/threads/:id/settle", handle: ({ params }) => done(actions.settle(params.id!)) },
    { method: "POST", path: "/api/threads/:id/unsettle", handle: ({ params }) => done(actions.unsettle(params.id!)) },
    { method: "POST", path: "/api/threads/:id/interrupt", handle: ({ params }) => done(actions.interrupt(params.id!)) },
    { method: "POST", path: "/api/threads/:id/subagents/:subagentId/stop", handle: ({ params }) => done(actions.stopSubagent(params.id!, params.subagentId!)) },
    {
      method: "POST",
      path: "/api/threads/:id/requests/:requestId/respond",
      handle: ({ params, body }) => done(actions.respond(params.id!, params.requestId!, validRespond(body))),
    },
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
    return servePwa(pathname) ?? (await site.serve(pathname)) ?? json(404, { error: "Unknown route" });
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
      const headers = new Headers(response.headers);
      // A sandboxed page allows framing by the dashboard itself: its own CSP replaces the default.
      const framable = headers.get("content-security-policy")?.includes("frame-ancestors 'self'");
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
        if (framable && name !== "x-content-type-options") continue;
        headers.set(name, value);
      }
      if (framable) headers.set("x-frame-options", "SAMEORIGIN");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}
