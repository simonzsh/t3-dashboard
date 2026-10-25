import type { Server } from "bun";
import type {
  ApprovalDecision,
  AssignIssueBody,
  AutomationsResult,
  ConnectionStatus,
  CreateThreadBody,
  DashboardState,
  LinearIssue,
  ModelSelection,
  RespondBody,
  SendMessageBody,
  UserInputAnswers,
} from "../shared/api.ts";
import { ACTIVE_STATUSES } from "./classify.ts";
import { HttpError } from "./httpError.ts";
import { toProviders } from "./live.ts";
import type { LinearBoard } from "./linear.ts";
import type { Settings } from "./settings.ts";
import type { Site } from "./site.ts";
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
import { VERSION } from "./version.ts";
import type { Command, T3Port } from "./t3/types.ts";

export interface SetupControl {
  /** Resolves the token again. */
  refresh(): Promise<void>;
  paste(token: string): Promise<"ok" | "rejected" | "unreachable" | "locked">;
  /** Reconnects to T3 now, without waiting for the backoff. */
  wake(): void;
}

export interface DashboardServerOptions {
  port: T3Port;
  store: Pick<ShellStore, "thread" | "project">;
  board: Pick<LinearBoard, "get">;
  automations: () => AutomationsResult;
  hub: SseHub;
  getState: () => DashboardState;
  connection: () => ConnectionStatus;
  site: Site;
  settings: Settings;
  setup: SetupControl;
  newId?: () => string;
}

const MAX_BODY_BYTES = 1024 * 1024;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const RUNNING_STATUSES = new Set(["preparing", "starting", "running", "waiting"]);
const CLAUDE_INSTANCE = "claudeAgent";
const CLAUDE_FALLBACK_MODEL = "claude-opus-5-5";
const CODEX_INSTANCE = "codex";
const DECISIONS = new Set<string>(["accept", "acceptForSession", "decline"]);

const SIMPLE_ACTIONS = new Map([
  ["archive", archiveCommand],
  ["pin", pinCommand],
  ["unpin", unpinCommand],
]);

const SECURITY_HEADERS = {
  "x-frame-options": "DENY",
  "content-security-policy": "frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
};

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

function hostnameOf(value: string): string | null {
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname;
  } catch {
    return null;
  }
}

function checkOrigin(req: Request): void {
  const host = req.headers.get("host");
  const origin = req.headers.get("origin");
  const hostOk = host !== null && LOCAL_HOSTS.has(hostnameOf(host) ?? "");
  const originOk = origin === null || LOCAL_HOSTS.has(hostnameOf(origin) ?? "");
  if (!hostOk || !originOk) throw new HttpError(403, "Forbidden host or origin");
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    throw new HttpError(400, "content-type must be application/json");
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (req.body) {
    for await (const chunk of req.body) {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) throw new HttpError(413, "Body over 1 MB");
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

function validAssign(body: Record<string, unknown>): AssignIssueBody {
  if (!isText(body.workspace) || !isText(body.issueId) || !isText(body.projectId) || (body.agent !== "claude" && body.agent !== "codex")) {
    throw new HttpError(400, "workspace, issueId, projectId and agent (claude or codex) are required");
  }
  return { workspace: body.workspace, issueId: body.issueId, agent: body.agent, projectId: body.projectId };
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

export interface DashboardHandler {
  fetch(req: Request, server?: Server<undefined>): Promise<Response>;
}

export function createDashboardServer(options: DashboardServerOptions): DashboardHandler {
  const { port, store, hub, board, automations, getState, connection, site, settings, setup } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());

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

  async function findIssue(body: AssignIssueBody): Promise<LinearIssue> {
    const lookup = async (refresh: boolean) => {
      const result = await board.get(refresh);
      const status = result.workspaces.find((workspace) => workspace.name === body.workspace);
      if (!status) throw new HttpError(404, "Unknown workspace");
      const issue = result.issues.find((entry) => entry.workspace === body.workspace && entry.id === body.issueId);
      return { status, issue };
    };
    let { status, issue } = await lookup(false);
    if (!issue) ({ status, issue } = await lookup(true));
    if (issue) return issue;
    if (!status.ok) throw new HttpError(502, status.error ?? "Linear error");
    throw new HttpError(404, "Unknown issue");
  }

  async function modelFor(agent: AssignIssueBody["agent"], defaultSelection: ModelSelection | null): Promise<ModelSelection> {
    if (agent === "claude") {
      return defaultSelection?.instanceId === CLAUDE_INSTANCE ? defaultSelection : { instanceId: CLAUDE_INSTANCE, model: CLAUDE_FALLBACK_MODEL };
    }
    const provider = toProviders(await t3(port.getConfig())).find((entry) => entry.instanceId === CODEX_INSTANCE);
    const first = provider?.models[0];
    if (!first) throw new HttpError(409, "No Codex model available");
    return { instanceId: CODEX_INSTANCE, model: first.slug };
  }

  async function assign(body: AssignIssueBody): Promise<string> {
    const issue = await findIssue(body);
    const project = store.project(body.projectId);
    if (!project) throw new HttpError(409, "T3 project not found");
    const modelSelection = await modelFor(body.agent, project.defaultModelSelection);
    const create = { projectId: project.id, title: `${issue.identifier} ${issue.title}`, text: `Traite le ticket Linear ${issue.identifier} : ${issue.url}`, modelSelection };
    const { threadId, commands } = createThreadCommands(create, newId);
    await send(...commands);
    return threadId;
  }

  async function api(req: Request, server: Server<undefined> | undefined, segments: string[]): Promise<Response> {
    const [, resource, id, action, requestId, requestAction] = segments;
    const method = req.method;
    if (method === "GET") {
      if (segments.length === 2 && resource === "health") return json(200, { ok: true, t3: connection().t3, version: VERSION });
      if (segments.length === 2 && resource === "state") return json(200, getState());
      if (segments.length === 2 && resource === "board") {
        const refresh = new URL(req.url).searchParams.get("refresh") === "1";
        return json(200, await board.get(refresh));
      }
      if (segments.length === 2 && resource === "automations") return json(200, automations());
      if (resource === "settings" && segments.length === 2) return json(200, settings.get());
      if (segments.length === 2 && resource === "events") {
        server?.timeout(req, 0);
        return hub.add(getState(), req.signal);
      }
      if (segments.length === 3 && resource === "threads" && id) {
        return json(200, toThreadDetail(id, await t3(port.threadProjection(id)), store.thread(id)));
      }
    } else if (method === "POST" && resource === "board" && id === "assign" && segments.length === 3) {
      const threadId = await assign(validAssign(await readJson(req)));
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
    } else if (method === "POST" && resource === "settings" && id === "linear") {
      const body = await readJson(req);
      if (segments.length === 4 && action === "key") return json(200, await settings.connectKey({ apiKey: String(body.apiKey ?? "") }));
      if (segments.length === 4 && action === "disconnect") return json(200, settings.disconnect());
    } else if (method === "POST" && resource === "threads") {
      const body = await readJson(req);
      if (segments.length === 2) {
        const { threadId, commands } = createThreadCommands(validCreate(body), newId);
        await send(...commands);
        return json(200, { ok: true, threadId });
      }
      if (id && segments.length === 4) {
        if (action === "messages") {
          if (!isText(body.text)) throw new HttpError(400, "text is required");
          if (body.mode !== undefined && body.mode !== "queue" && body.mode !== "steer") throw new HttpError(400, "mode must be queue or steer");
          await sendMessage(id, { text: body.text, ...(body.mode && { mode: body.mode }) });
          return json(200, { ok: true });
        }
        if (action === "interrupt") {
          await interrupt(id);
          return json(200, { ok: true });
        }
        const simple = SIMPLE_ACTIONS.get(action ?? "");
        if (simple) {
          await send(simple(id, newId));
          return json(200, { ok: true });
        }
      }
      if (id && segments.length === 6 && action === "requests" && requestId) {
        if (requestAction === "respond") {
          const answer = validRespond(body);
          await send("decision" in answer ? approvalCommand(id, requestId, answer.decision, newId) : userInputCommand(id, requestId, answer.answers, newId));
          return json(200, { ok: true });
        }
        if (requestAction === "dismiss") {
          await send(dismissCommand(id, requestId, newId));
          return json(200, { ok: true });
        }
      }
    }
    throw new HttpError(404, "Unknown route");
  }

  async function handle(req: Request, server: Server<undefined> | undefined): Promise<Response> {
    checkOrigin(req);
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
        if (!(error instanceof HttpError)) console.error(error);
        const status = error instanceof HttpError ? error.status : 500;
        const message = error instanceof HttpError ? error.message : "Internal error";
        response = json(status, { error: message }, status === 413 ? { connection: "close" } : undefined);
      }
      // Forbids framing: a hostile page could otherwise clickjack the approval buttons.
      const headers = new Headers(response.headers);
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    },
  };
}
