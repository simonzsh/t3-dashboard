import type { BoardResult, LinearIssue, LinearWorkspaceStatus } from "../shared/api.ts";
import type { LinearWorkspaceConfig } from "./linearConfig.ts";

const ENDPOINT = "https://api.linear.app/graphql";
const CACHE_MS = 60_000;
const VIEWER_QUERY = "{ viewer { id } }";
const QUERY = `query($after: String) { viewer { assignedIssues(first: 100, after: $after, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title url priority priorityLabel updatedAt state { name type color } project { id name } team { key name } } pageInfo { hasNextPage endCursor } } } }`;
// 20 pages of 100: a hard stop for a runaway cursor.
const MAX_PAGES = 20;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LinearBoardOptions {
  fetch: FetchLike;
  readWorkspaces: () => LinearWorkspaceConfig[];
  now: () => Date;
}

type Nodes = Array<Omit<LinearIssue, "workspace">>;

// A stalled Linear would otherwise hold the board request for minutes.
const FETCH_TIMEOUT_MS = 15_000;

export type KeyCheck = "ok" | "refused" | "unreachable";

// Linear answers 400, 401 or 403 to a key it does not know.
const REFUSED_STATUSES = new Set([400, 401, 403]);

class LinearError extends Error {
  readonly check: Exclude<KeyCheck, "ok">;
  constructor(check: Exclude<KeyCheck, "ok">, message: string) {
    super(message);
    this.check = check;
  }
}

// Error texts never include the response body or the key: both can echo it back.
async function query(options: LinearBoardOptions, apiKey: string, text: string, variables?: Record<string, unknown>): Promise<Record<string, any>> {
  let response: Response;
  try {
    response = await options.fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: apiKey }, body: JSON.stringify({ query: text, variables }), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new LinearError("unreachable", "Linear is unreachable");
  }
  if (REFUSED_STATUSES.has(response.status)) throw new LinearError("refused", `Linear refused this key (HTTP ${response.status})`);
  if (!response.ok) throw new LinearError("unreachable", `Linear answered HTTP ${response.status}`);
  let body: { data?: Record<string, any>; errors?: unknown };
  try {
    body = await response.json();
  } catch {
    throw new LinearError("unreachable", "Unreadable Linear response");
  }
  if (body.errors || !body.data) throw new LinearError("refused", "Linear returned an error");
  return body.data;
}

async function fetchIssues(options: LinearBoardOptions, apiKey: string): Promise<Nodes> {
  const issues: Nodes = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const connection = (await query(options, apiKey, QUERY, { after })).viewer?.assignedIssues;
    if (!Array.isArray(connection?.nodes)) throw new LinearError("refused", "Linear returned an error");
    issues.push(...connection.nodes);
    if (connection.pageInfo?.hasNextPage !== true) return issues;
    if (typeof connection.pageInfo.endCursor !== "string") throw new LinearError("refused", "Linear returned an error");
    after = connection.pageInfo.endCursor;
  }
  throw new LinearError("unreachable", `Too many assigned issues to load (over ${MAX_PAGES * 100})`);
}

/** Assigned Linear issues per workspace, cached for a minute. Each workspace is read on its own. */
export class LinearBoard {
  private readonly options: LinearBoardOptions;
  private cached: { at: number; board: BoardResult } | null = null;

  constructor(options: LinearBoardOptions) {
    this.options = options;
  }

  /** Forgets the cached board: call it after the key changed. */
  invalidate(): void {
    this.cached = null;
  }

  async verifyKey(apiKey: string): Promise<KeyCheck> {
    try {
      await query(this.options, apiKey, VIEWER_QUERY);
      return "ok";
    } catch (error) {
      return error instanceof LinearError ? error.check : "unreachable";
    }
  }

  async get(refresh = false): Promise<BoardResult> {
    const now = this.options.now();
    if (!refresh && this.cached && now.getTime() - this.cached.at < CACHE_MS) return this.cached.board;
    const workspaces = this.options.readWorkspaces();
    const results = await Promise.all(workspaces.map((workspace) => this.read(workspace)));
    const board: BoardResult = {
      workspaces: results.map((r) => r.status),
      issues: results.flatMap((r) => r.issues),
      configured: workspaces.some((workspace) => workspace.apiKey !== ""),
    };
    this.cached = { at: now.getTime(), board };
    return board;
  }

  private async read(workspace: LinearWorkspaceConfig): Promise<{ status: LinearWorkspaceStatus; issues: LinearIssue[] }> {
    const status: LinearWorkspaceStatus = { name: workspace.name, ok: true, error: null };
    if (workspace.apiKey === "") return { status: { ...status, ok: false, error: "Missing API key" }, issues: [] };
    try {
      const nodes = await fetchIssues(this.options, workspace.apiKey);
      return { status, issues: nodes.map((node) => ({ ...node, workspace: workspace.name })) };
    } catch (error) {
      return { status: { ...status, ok: false, error: (error as Error).message }, issues: [] };
    }
  }
}
