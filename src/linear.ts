import type { BoardResult, LinearIssue, LinearWorkspaceStatus } from "../shared/api.ts";
import type { LinearWorkspaceConfig } from "./linearConfig.ts";

const ENDPOINT = "https://api.linear.app/graphql";
const CACHE_MS = 60_000;
const QUERY = `{ viewer { assignedIssues(first: 100, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { id identifier title url priority priorityLabel updatedAt state { name type color } project { id name } team { key name } } } } }`;

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface LinearBoardOptions {
  fetch: FetchLike;
  readWorkspaces: () => LinearWorkspaceConfig[];
  resolveProject: (t3Project: string) => string | null;
  now: () => Date;
}

type Nodes = Array<Omit<LinearIssue, "workspace">>;

// A stalled Linear would otherwise hold the board request for minutes.
const FETCH_TIMEOUT_MS = 15_000;

// Error texts never include the response body or the key: both can echo it back.
async function fetchIssues(options: LinearBoardOptions, apiKey: string): Promise<Nodes> {
  let response: Response;
  try {
    response = await options.fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", authorization: apiKey }, body: JSON.stringify({ query: QUERY }), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    throw new Error("Linear est injoignable");
  }
  if (!response.ok) throw new Error(`Linear a répondu HTTP ${response.status}`);
  let body: { data?: { viewer?: { assignedIssues?: { nodes?: Nodes } } }; errors?: unknown };
  try {
    body = await response.json();
  } catch {
    throw new Error("Réponse Linear illisible");
  }
  const nodes = body.data?.viewer?.assignedIssues?.nodes;
  if (body.errors || !Array.isArray(nodes)) throw new Error("Linear a renvoyé une erreur");
  return nodes;
}

/** Assigned Linear issues per workspace, cached for a minute. Each workspace is read on its own. */
export class LinearBoard {
  private readonly options: LinearBoardOptions;
  private cached: { at: number; board: BoardResult } | null = null;
  private configs = new Map<string, LinearWorkspaceConfig>();

  constructor(options: LinearBoardOptions) {
    this.options = options;
  }

  workspace(name: string): LinearWorkspaceConfig | undefined {
    return this.configs.get(name);
  }

  async get(refresh = false): Promise<BoardResult> {
    const now = this.options.now();
    if (!refresh && this.cached && now.getTime() - this.cached.at < CACHE_MS) return this.cached.board;
    const workspaces = this.options.readWorkspaces();
    this.configs = new Map(workspaces.map((workspace) => [workspace.name, workspace]));
    const results = await Promise.all(workspaces.map((workspace) => this.read(workspace)));
    const board: BoardResult = { workspaces: results.map((r) => r.status), issues: results.flatMap((r) => r.issues), fetchedAt: now.toISOString() };
    this.cached = { at: now.getTime(), board };
    return board;
  }

  private async read(workspace: LinearWorkspaceConfig): Promise<{ status: LinearWorkspaceStatus; issues: LinearIssue[] }> {
    const status: LinearWorkspaceStatus = { name: workspace.name, ok: true, error: null, t3ProjectId: this.options.resolveProject(workspace.t3Project) };
    if (workspace.apiKey === "") return { status: { ...status, ok: false, error: "Clé API manquante" }, issues: [] };
    try {
      const nodes = await fetchIssues(this.options, workspace.apiKey);
      return { status, issues: nodes.map((node) => ({ ...node, workspace: workspace.name })) };
    } catch (error) {
      return { status: { ...status, ok: false, error: (error as Error).message }, issues: [] };
    }
  }
}
