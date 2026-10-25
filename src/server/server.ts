import type { Server } from "bun";
import type { AutomationsResult, ConnectionStatus, DashboardState } from "../../shared/api.ts";
import { MAX_MESSAGE_BODY_BYTES } from "../../shared/limits.ts";
import type { Actions } from "../domain/actions.ts";
import type { LinearBoard } from "../domain/linearBoard.ts";
import type { Settings } from "../domain/settings.ts";
import type { UpdateManager } from "../domain/updates.ts";
import { VERSION } from "../config/version.ts";
import { HttpError, toHttp } from "./httpError.ts";
import type { Site } from "./site.ts";
import type { SseHub } from "./sse.ts";
import { isObject, isText, validAssign, validCreate, validImages, validMessage, validRespond, validSettings } from "./validate.ts";

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

export function createDashboardServer(options: DashboardServerOptions): DashboardHandler {
  const { actions, hub, board, automations, getState, connection, site, settings, setup, updates } = options;
  const allowedHosts = new Set([...LOCAL_HOSTS, ...(options.allowedHosts ?? [])]);

  async function api(req: Request, server: Server<undefined> | undefined, segments: string[]): Promise<Response> {
    const [, resource, id, action, requestId, requestAction] = segments;
    const method = req.method;
    if (method === "GET") {
      if (segments.length === 2 && resource === "health") return json(200, { ok: true, t3: connection().t3, version: VERSION });
      if (segments.length === 2 && resource === "board") {
        const refresh = new URL(req.url).searchParams.get("refresh") === "1";
        return json(200, await board.get(refresh));
      }
      if (segments.length === 2 && resource === "automations") return json(200, automations());
      if (resource === "settings" && segments.length === 2) return json(200, settings.get());
      if (resource === "update" && segments.length === 2) return json(200, updates.status());
      if (segments.length === 2 && resource === "events") {
        server?.timeout(req, 0);
        return hub.add(getState(), req.signal);
      }
      if (segments.length === 3 && resource === "threads" && id) {
        return json(200, await actions.threadDetail(id));
      }
    } else if (method === "POST" && resource === "board" && id === "assign" && segments.length === 3) {
      const threadId = await actions.assign(validAssign(await readJson(req)));
      return json(200, { ok: true, threadId });
    } else if (method === "POST" && resource === "setup" && segments.length === 3) {
      const body = await readJson(req);
      if (id === "retry") {
        await setup.refresh();
        setup.wake();
        return json(200, connection());
      }
      if (id === "token") {
        if (!isText(body.token)) throw new HttpError(400, "Paste a token first.");
        const result = await setup.paste(body.token);
        if (result === "locked") throw new HttpError(409, "T3_DASHBOARD_TOKEN_FILE is set: put the token in that file.");
        if (result === "rejected") throw new HttpError(400, "T3 Code refused this token.");
        if (result === "unreachable") throw new HttpError(502, "T3 Code is unreachable.");
        setup.wake();
        return json(200, connection());
      }
    } else if (method === "POST" && resource === "update" && segments.length === 3) {
      await readJson(req);
      if (id === "check") return json(200, await updates.check());
      if (id === "apply") {
        const result = updates.apply();
        if (!result.started) throw new HttpError(409, result.reason);
        return json(202, updates.status());
      }
    } else if (method === "POST" && resource === "settings" && id === "linear") {
      const body = await readJson(req);
      if (segments.length === 4 && action === "key") return json(200, await settings.connectKey({ apiKey: String(body.apiKey ?? "") }));
      if (segments.length === 4 && action === "disconnect") return json(200, settings.disconnect());
    } else if (method === "POST" && resource === "threads") {
      const withImages = segments.length === 2 || (segments.length === 4 && action === "messages");
      const body = await readJson(req, withImages ? MAX_MESSAGE_BODY_BYTES : MAX_BODY_BYTES);
      if (segments.length === 2) {
        const threadId = await actions.createThread(validCreate(body), validImages(body.attachments));
        return json(200, { ok: true, threadId });
      }
      if (id && segments.length === 4) {
        if (action === "messages") {
          const { message, images } = validMessage(body);
          await actions.sendMessage(id, message, images);
          return json(200, { ok: true });
        }
        if (action === "settings") {
          await actions.changeSettings(id, validSettings(body));
          return json(200, { ok: true });
        }
        if (action === "interrupt") {
          await actions.interrupt(id);
          return json(200, { ok: true });
        }
      }
      if (id && segments.length === 6 && action === "requests" && requestId) {
        if (requestAction === "respond") {
          await actions.respond(id, requestId, validRespond(body));
          return json(200, { ok: true });
        }
        if (requestAction === "dismiss") {
          await actions.dismiss(id, requestId);
          return json(200, { ok: true });
        }
      }
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
    return (await site.serve(pathname)) ?? json(404, { error: "Unknown route" });
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
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}
