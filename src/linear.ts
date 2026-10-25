import type { BoardResult, LinearIssue, LinearTeam, LinearWorkspaceStatus } from "../shared/api.ts";
import type { LinearWorkspaceConfig } from "./linearConfig.ts";

const ENDPOINT = "https://api.linear.app/graphql";
const CACHE_MS = 60_000;
const VIEWER_QUERY = "{ viewer { id } }";
const TEAMS_QUERY = "{ teams(first: 250) { nodes { key name } } }";
const QUERY = `{ viewer { assignedIssues(first: 100, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title url priority priorityLabel updatedAt state { name type color } project { id name } team { key name } } } } }`;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LinearBoardOptions {
  fetch: FetchLike;
  readWorkspaces: () => LinearWorkspaceConfig[];
  resolveProject: (t3Project: string) => string | null;
  now: () => Date;
}

type Nodes = Array<Omit<LinearIssue, "workspace" | "t3ProjectId">>;

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
async function query(options: LinearBoardOptions, apiKey: string, text: string): Promise<Record<string, any>> {
  let response: Response;
  try {
    response = await options.fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: apiKey }, body: JSON.stringify({ query: text }), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
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
  const nodes = (await query(options, apiKey, QUERY)).viewer?.assignedIssues?.nodes;
  if (!Array.isArray(nodes)) throw new LinearError("refused", "Linear returned an error");
  return nodes;
}

/** Assigned Linear issues per workspace, cached for a minute. Each workspace is read on its own. */
export class LinearBoard {
  private readonly options: LinearBoardOptions;
  private cached: { at: number; board: BoardResult } | null = null;

  constructor(options: LinearBoardOptions) {
    this.options = options;
  }

  /** Forgets the cached board: call it after the key or the team table changed. */
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

  async listTeams(apiKey: string): Promise<{ teams: LinearTeam[] } | KeyCheck> {
    try {
      const nodes = (await query(this.options, apiKey, TEAMS_QUERY)).teams?.nodes;
      if (!Array.isArray(nodes)) return "unreachable";
      return { teams: nodes.map((node: LinearTeam) => ({ key: node.key, name: node.name })) };
    } catch (error) {
      return error instanceof LinearError && error.check === "refused" ? "refused" : "unreachable";
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
      fetchedAt: now.toISOString(),
      configured: workspaces.some((workspace) => workspace.apiKey !== ""),
    };
    this.cached = { at: now.getTime(), board };
    return board;
  }

  private async read(workspace: LinearWorkspaceConfig): Promise<{ status: LinearWorkspaceStatus; issues: LinearIssue[] }> {
    const resolve = (title: string) => (title === "" ? null : this.options.resolveProject(title));
    const status: LinearWorkspaceStatus = { name: workspace.name, ok: true, error: null, t3ProjectId: resolve(workspace.t3Project) };
    if (workspace.apiKey === "") return { status: { ...status, ok: false, error: "Missing API key" }, issues: [] };
    try {
      const nodes = await fetchIssues(this.options, workspace.apiKey);
      const { teams } = workspace;
      const issues = nodes.flatMap((node) => {
        // null hides the team. Teams outside the table follow `unlisted`.
        const listed = teams !== null && Object.hasOwn(teams, node.team.key);
        const title = listed ? teams[node.team.key] : workspace.unlisted === "show" ? (teams ? "" : workspace.t3Project) : null;
        return title === null || title === undefined ? [] : [{ ...node, workspace: workspace.name, t3ProjectId: resolve(title) }];
      });
      return { status, issues };
    } catch (error) {
      return { status: { ...status, ok: false, error: (error as Error).message }, issues: [] };
    }
  }
}
