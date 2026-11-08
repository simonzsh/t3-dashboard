import type { DashboardThread, PendingCategory } from "../../shared/api.ts";
import { isRepository } from "../../shared/git.ts";
import type { RawThread } from "../integrations/t3/schemas.ts";

const EPOCH = new Date(0).toISOString();

const APPROVAL_KINDS = new Set(["command", "file-read", "file-change", "permission", "mcp-elicitation"]);

/** A provider's subagent thread: the shell hides it, the parent's timeline shows it. */
export const isSubagentThread = (raw: RawThread): boolean => raw.lineage?.relationshipToParent === "subagent" && raw.creationSource === "provider";

export function isHidden(raw: RawThread, location?: string): boolean {
  return isSubagentThread(raw) || Boolean(raw.deletedAt) || Boolean(raw.archivedAt) || location === "archive";
}

// `updatedAt` is left out: a pin or a visit bumps it without any real activity.
function lastActivityOf(raw: RawThread): string {
  const candidates = [
    raw.latestVisibleMessage?.updatedAt,
    raw.latestRunCompletedAt,
    raw.activityRunStartedAt,
    raw.latestRunStartedAt,
    raw.latestUserMessageAt,
    raw.createdAt,
  ].filter((value): value is string => typeof value === "string" && !Number.isNaN(Date.parse(value)));
  return candidates.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest), EPOCH);
}

// The turn can end while subagents keep working: the agent is not finished yet.
const hasBackgroundWork = (raw: RawThread): boolean => (raw.pendingBackgroundTasks?.length ?? 0) > 0 || raw.blockedOnThreadWait === true;

// Same sections as the T3 Code sidebar: a snooze shows first, then the settled override.
// A pending request wakes a snoozed thread.
export function isSettled(raw: RawThread, now: Date): boolean {
  const snoozed = raw.snoozedUntil != null && Date.parse(raw.snoozedUntil) > now.getTime() && !raw.pendingRuntimeRequest;
  return !snoozed && raw.settledOverride === "settled";
}

function categoryOf(kind: string): PendingCategory {
  if (APPROVAL_KINDS.has(kind)) return "approval";
  return kind === "user_input" ? "user-input" : "other";
}

// A pull request without a usable repository, number or URL is dropped: the link would be dead.
function pullRequestOf(raw: RawThread): DashboardThread["pullRequest"] {
  for (const pr of [raw.linkedPullRequest, raw.branchPullRequest]) {
    if (pr?.repository && isRepository(pr.repository) && typeof pr.number === "number" && Number.isInteger(pr.number) && pr.number > 0 && pr.url) return { repository: pr.repository, number: pr.number, url: pr.url };
  }
  return null;
}

export function toDashboardThread(raw: RawThread, now: Date): DashboardThread {
  const pending = raw.pendingRuntimeRequest;
  return {
    id: raw.id,
    projectId: raw.projectId ?? "",
    title: raw.title ?? "",
    provider: raw.providerInstanceId ?? raw.modelSelection?.instanceId ?? "",
    model: raw.modelSelection?.model ?? null,
    status: raw.status ?? "idle",
    settled: isSettled(raw, now),
    pending: pending ? { category: categoryOf(pending.kind) } : null,
    activeRunId: raw.activeRunId ?? null,
    backgroundWork: hasBackgroundWork(raw),
    pendingTasks: (raw.pendingBackgroundTasks?.length ?? 0) > 0,
    lastError: raw.lastError ?? null,
    pinned: raw.pinnedAt != null,
    lastActivityAt: lastActivityOf(raw),
    branch: raw.branch ?? null,
    pullRequest: pullRequestOf(raw),
  };
}
