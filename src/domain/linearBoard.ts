import type { BoardResult } from "../../shared/api.ts";
import type { KeyCheck, LinearClient } from "../integrations/linear/client.ts";

const CACHE_MS = 60_000;

export interface LinearBoardOptions {
  client: Pick<LinearClient, "assignedIssues" | "verifyKey">;
  readKey: () => string;
  now: () => Date;
}

/** Issues assigned to the owner of the Linear key, cached for a minute. */
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
    const board = await this.read(this.options.readKey());
    this.cached = { at: now.getTime(), board };
    return board;
  }

  private async read(apiKey: string): Promise<BoardResult> {
    if (apiKey === "") return { configured: false, ok: false, error: "Missing API key", issues: [] };
    try {
      return { configured: true, ok: true, error: null, issues: await this.options.client.assignedIssues(apiKey) };
    } catch (error) {
      return { configured: true, ok: false, error: (error as Error).message, issues: [] };
    }
  }
}
