import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ApprovalDecision,
  ConnectionStatus,
  CreateThreadBody,
  DashboardState,
  RespondBody,
  SendMessageBody,
  UserInputAnswers,
} from "../shared/api.ts";
import { ACTIVE_STATUSES } from "./classify.ts";
import type { ShellStore } from "./shellStore.ts";
import type { SseHub } from "./sse.ts";
import {
  approvalCommand,
  archiveCommand,
  createThreadCommands,
  dismissCommand,
  interruptCommand,
  messageCommand,
  pinCommand,
  unpinCommand,
  userInputCommand,
} from "./t3/commands.ts";
import type { DispatchMode } from "./t3/commands.ts";
import { toThreadDetail } from "./threadDetail.ts";
import type { Command, T3Port } from "./t3/types.ts";

export interface DashboardServerOptions {
  port: T3Port;
  store: Pick<ShellStore, "thread">;
  hub: SseHub;
  getState: () => DashboardState;
  connection: () => ConnectionStatus;
  staticDir: string | URL;
  newId?: () => string;
}

const MAX_BODY_BYTES = 1024 * 1024;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const RUNNING_STATUSES = new Set(["preparing", "starting", "running", "waiting"]);
const DECISIONS = new Set<string>(["accept", "acceptForSession", "decline"]);
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".ico": "image/x-icon",
};
const MISSING_BUILD_PAGE = "<!doctype html><meta charset=utf-8><p>Interface non construite : lancez <code>npm run build</code>.</p>";

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

function checkOrigin(req: IncomingMessage): void {
  const host = req.headers.host;
  const origin = req.headers.origin;
  const hostOk = host !== undefined && LOCAL_HOSTS.has(hostnameOf(host) ?? "");
  const originOk = origin === undefined || LOCAL_HOSTS.has(hostnameOf(origin) ?? "");
  if (!hostOk || !originOk) throw new HttpError(403, "Forbidden host or origin");
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(400, "content-type must be application/json");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Body over 1 MB");
    chunks.push(chunk as Buffer);
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function validCreate(body: Record<string, unknown>): CreateThreadBody {
  const selection = body.modelSelection;
  if (!isText(body.projectId) || !isText(body.title) || !isText(body.text) || !isObject(selection) || !isText(selection.instanceId) || !isText(selection.model)) {
    throw new HttpError(400, "projectId, title, text and modelSelection (instanceId, model) are required");
  }
  const { instanceId, model, options } = selection;
  return {
    projectId: body.projectId.trim(),
    title: body.title.trim(),
    text: body.text,
    modelSelection: { instanceId, model, ...(Array.isArray(options) && { options: options as Array<{ id: string; value: unknown }> }) },
  };
}

function validRespond(body: Record<string, unknown>): RespondBody {
  const hasDecision = "decision" in body;
  const hasAnswers = "answers" in body;
  if (hasDecision === hasAnswers) throw new HttpError(400, "Send either decision or answers");
  if (hasDecision) {
    if (typeof body.decision !== "string" || !DECISIONS.has(body.decision)) throw new HttpError(400, "decision must be accept, acceptForSession or decline");
    return { decision: body.decision as ApprovalDecision };
  }
  const answers = body.answers;
  const valid = isObject(answers) && Object.values(answers).every((value) => typeof value === "string" || (Array.isArray(value) && value.every((entry) => typeof entry === "string")));
  if (!valid) throw new HttpError(400, "answers must map question ids to strings or string arrays");
  return { answers: answers as UserInputAnswers };
}

export function createDashboardServer(options: DashboardServerOptions): Server {
  const { port, store, hub, getState, connection } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const staticRoot = resolve(typeof options.staticDir === "string" ? options.staticDir : fileURLToPath(options.staticDir));

  const t3 = async <T>(work: Promise<T>): Promise<T> => {
    try {
      return await work;
    } catch (error) {
      throw new HttpError(502, (error as Error).message);
    }
  };
  const send = async (...commands: Command[]) => {
    for (const command of commands) await t3(port.dispatch(command));
  };

  async function sendMessage(threadId: string, body: SendMessageBody): Promise<void> {
    const thread = store.thread(threadId);
    const active = thread !== undefined && ACTIVE_STATUSES.has(thread.status);
    let dispatchMode: DispatchMode = { type: "start_immediately" };
    if (active && body.mode === "steer") {
      if (!thread.activeRunId) throw new HttpError(409, "No active run to steer");
      dispatchMode = { type: "steer_active", targetRunId: thread.activeRunId };
    } else if (active) {
      dispatchMode = { type: "queue_after_active" };
    }
    await send(messageCommand(threadId, body.text, dispatchMode, newId));
  }

  async function interrupt(threadId: string): Promise<void> {
    let runId = store.thread(threadId)?.activeRunId ?? null;
    if (!runId) {
      const { runs = [] } = await t3(port.threadProjection(threadId));
      runId = runs.findLast((run) => RUNNING_STATUSES.has(run.status ?? ""))?.id ?? null;
    }
    if (!runId) throw new HttpError(409, "No active run to interrupt");
    await send(interruptCommand(threadId, runId, newId));
  }

  async function api(req: IncomingMessage, res: ServerResponse, segments: string[]): Promise<void> {
    const [, resource, id, action, requestId, requestAction] = segments;
    const method = req.method;
    if (method === "GET") {
      if (segments.length === 2 && resource === "health") return sendJson(res, 200, { ok: true, t3: connection().t3 });
      if (segments.length === 2 && resource === "state") return sendJson(res, 200, getState());
      if (segments.length === 2 && resource === "events") return hub.add(res, getState());
      if (segments.length === 3 && resource === "threads" && id) {
        return sendJson(res, 200, toThreadDetail(id, await t3(port.threadProjection(id)), store.thread(id)));
      }
    } else if (method === "POST" && resource === "threads") {
      const body = await readJson(req);
      if (segments.length === 2) {
        const { threadId, commands } = createThreadCommands(validCreate(body), newId);
        await send(...commands);
        return sendJson(res, 200, { ok: true, threadId });
      }
      if (id && segments.length === 4) {
        if (action === "messages") {
          if (!isText(body.text)) throw new HttpError(400, "text is required");
          if (body.mode !== undefined && body.mode !== "queue" && body.mode !== "steer") throw new HttpError(400, "mode must be queue or steer");
          await sendMessage(id, { text: body.text, ...(body.mode && { mode: body.mode }) });
          return sendJson(res, 200, { ok: true });
        }
        if (action === "interrupt") {
          await interrupt(id);
          return sendJson(res, 200, { ok: true });
        }
        const simple = { archive: archiveCommand, pin: pinCommand, unpin: unpinCommand }[action ?? ""];
        if (simple) {
          await send(simple(id, newId));
          return sendJson(res, 200, { ok: true });
        }
      }
      if (id && segments.length === 6 && action === "requests" && requestId) {
        if (requestAction === "respond") {
          const answer = validRespond(body);
          await send("decision" in answer ? approvalCommand(id, requestId, answer.decision, newId) : userInputCommand(id, requestId, answer.answers, newId));
          return sendJson(res, 200, { ok: true });
        }
        if (requestAction === "dismiss") {
          await send(dismissCommand(id, requestId, newId));
          return sendJson(res, 200, { ok: true });
        }
      }
    }
    throw new HttpError(404, "Unknown route");
  }

  async function serveStatic(res: ServerResponse, pathname: string): Promise<void> {
    const file = resolve(staticRoot, pathname);
    const inside = file === staticRoot || file.startsWith(staticRoot + sep);
    const target = inside && (await stat(file).catch(() => null))?.isFile() ? file : join(staticRoot, "index.html");
    try {
      const content = await readFile(target);
      res.writeHead(200, { "content-type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream" });
      res.end(content);
    } catch {
      res.writeHead(200, { "content-type": CONTENT_TYPES[".html"]! });
      res.end(MISSING_BUILD_PAGE);
    }
  }

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    checkOrigin(req);
    let segments: string[];
    try {
      segments = new URL(req.url ?? "/", "http://localhost").pathname.split("/").slice(1).map(decodeURIComponent);
    } catch {
      throw new HttpError(400, "Malformed URL");
    }
    if (segments[0] === "api") return api(req, res, segments);
    if (req.method !== "GET" && req.method !== "HEAD") throw new HttpError(404, "Unknown route");
    const pathname = segments.join("/");
    if (pathname.includes("\0")) throw new HttpError(400, "Malformed URL");
    return serveStatic(res, pathname);
  }

  return createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError ? error.message : "Internal error";
      if (res.headersSent) return res.end();
      res.setHeader("connection", status === 413 ? "close" : "keep-alive");
      sendJson(res, status, { error: message });
    });
  });
}
