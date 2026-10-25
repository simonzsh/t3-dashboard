import type { BoardResult, LinearIssue, LinearWorkspaceStatus } from "../shared/api.ts";
import type { KeyCheck, LinearClient } from "./integrations/linear/client.ts";
import type { LinearWorkspaceConfig } from "./linearConfig.ts";

const CACHE_MS = 60_000;

export interface LinearBoardOptions {
  client: Pick<LinearClient, "assignedIssues" | "verifyKey">;
  readWorkspaces: () => LinearWorkspaceConfig[];
  now: () => Date;
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

  verifyKey(apiKey: string): Promise<KeyCheck> {
    return this.options.client.verifyKey(apiKey);
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
      const nodes = await this.options.client.assignedIssues(workspace.apiKey);
      return { status, issues: nodes.map((node) => ({ ...node, workspace: workspace.name })) };
    } catch (error) {
      return { status: { ...status, ok: false, error: (error as Error).message }, issues: [] };
    }
  }
}
