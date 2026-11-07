import type { BoardResult, LinearInboxItem, LinearInboxKind } from "../../shared/api.ts";
import type { KeyCheck, LinearClient } from "../integrations/linear/client.ts";
import type { LinearInboxNode } from "../integrations/linear/schemas.ts";

const CACHE_MS = 60_000;

const KINDS: Record<string, LinearInboxKind> = { issueMention: "mention", issueCommentMention: "comment-mention", issueAssignedToYou: "assigned" };

export interface LinearBoardOptions {
  client: Pick<LinearClient, "assignedIssues" | "inbox" | "verifyKey">;
  readKey: () => string;
  now: () => Date;
}

/** The inbox items worth a glance: unread, not archived, not snoozed, newest first. */
export function inboxItems(nodes: LinearInboxNode[], now: Date): LinearInboxItem[] {
  const items: LinearInboxItem[] = [];
  for (const node of nodes) {
    const kind = KINDS[node.type];
    if (!kind || node.readAt !== null || node.archivedAt !== null) continue;
    if (node.snoozedUntilAt !== null && Date.parse(node.snoozedUntilAt) > now.getTime()) continue;
    // An assignment on a closed issue needs no action.
    if (kind === "assigned" && ["completed", "canceled"].includes(node.issue.state.type)) continue;
    const { id, identifier, title, url, priority } = node.issue;
    items.push({
      id: node.id,
      kind,
      createdAt: node.createdAt,
      actor: node.actor?.name ?? node.botActor?.name ?? null,
      url: kind === "comment-mention" ? (node.comment?.url ?? url) : url,
      issue: { id, identifier, title, url, priority },
    });
  }
  return items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

/** Issues assigned to the owner of the Linear key and their unread inbox, cached for a minute. */
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
    const board = await this.read(this.options.readKey(), now);
    this.cached = { at: now.getTime(), board };
    return board;
  }

  private async read(apiKey: string, now: Date): Promise<BoardResult> {
    const readAt = now.toISOString();
    if (apiKey === "") return { configured: false, ok: false, error: "Missing API key", issues: [], readAt, inbox: [], inboxError: null };
    const [issues, inbox] = await Promise.allSettled([this.options.client.assignedIssues(apiKey), this.options.client.inbox(apiKey)]);
    if (issues.status === "rejected") return { configured: true, ok: false, error: (issues.reason as Error).message, issues: [], readAt, inbox: [], inboxError: null };
    if (inbox.status === "rejected") return { configured: true, ok: true, error: null, issues: issues.value, readAt, inbox: [], inboxError: (inbox.reason as Error).message };
    return { configured: true, ok: true, error: null, issues: issues.value, readAt, inbox: inboxItems(inbox.value, now), inboxError: null };
  }
}
