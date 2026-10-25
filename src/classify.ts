import type { Bucket, DashboardThread, PendingCategory } from "../shared/api.ts";
import type { RawThread } from "./t3/types.ts";

export const DONE_WINDOW_DAYS = 7;
const PREVIEW_MAX = 280;
const DAY_MS = 24 * 60 * 60 * 1000;
const EPOCH = new Date(0).toISOString();

export const ACTIVE_STATUSES = new Set(["preparing", "queued", "starting", "running", "waiting"]);
const FINISHED_STATUSES = new Set(["completed", "interrupted", "rolled_back"]);
const APPROVAL_KINDS = new Set(["command", "file-read", "file-change", "permission", "mcp-elicitation"]);

export function isHidden(raw: RawThread, location?: string): boolean {
  const subagent = raw.lineage?.relationshipToParent === "subagent" && raw.creationSource === "provider";
  return subagent || Boolean(raw.deletedAt) || Boolean(raw.archivedAt) || location === "archive";
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

export function bucketOf(raw: RawThread, now: Date): Bucket {
  const status = raw.status ?? "idle";
  if (raw.pendingRuntimeRequest) return "todo";
  if (ACTIVE_STATUSES.has(status) || hasBackgroundWork(raw)) return "running";
  if (raw.snoozedUntil && Date.parse(raw.snoozedUntil) > now.getTime()) return "inactive";
  if (raw.settledOverride === "settled" || (raw.settledAt != null && raw.settledOverride !== "active")) return "inactive";
  if (raw.hasActionableProposedPlan) return "todo";
  if (status === "failed" || (status === "interrupted" && raw.lastError)) return "todo";
  if (FINISHED_STATUSES.has(status)) {
    const age = now.getTime() - Date.parse(lastActivityOf(raw));
    return age <= DONE_WINDOW_DAYS * DAY_MS ? "done" : "inactive";
  }
  return "inactive";
}

function categoryOf(kind: string): PendingCategory {
  if (APPROVAL_KINDS.has(kind)) return "approval";
  return kind === "user_input" ? "user-input" : "other";
}

function previewOf(message: RawThread["latestVisibleMessage"]): DashboardThread["preview"] {
  if (!message || typeof message.text !== "string") return null;
  const text = message.text.length > PREVIEW_MAX ? `${message.text.slice(0, PREVIEW_MAX)}…` : message.text;
  return { role: message.role ?? "", text };
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
    bucket: bucketOf(raw, now),
    pending: pending ? { requestId: pending.id, kind: pending.kind, category: categoryOf(pending.kind) } : null,
    activeRunId: raw.activeRunId ?? null,
    backgroundWork: hasBackgroundWork(raw),
    pendingTasks: (raw.pendingBackgroundTasks?.length ?? 0) > 0,
    lastError: raw.lastError ?? null,
    hasActionableProposedPlan: raw.hasActionableProposedPlan ?? false,
    preview: previewOf(raw.latestVisibleMessage),
    pinned: raw.pinnedAt != null,
    branch: raw.branch ?? null,
    pullRequestUrl: raw.linkedPullRequest?.url ?? raw.pullRequests?.[0]?.url ?? null,
    createdAt: raw.createdAt ?? EPOCH,
    updatedAt: raw.updatedAt ?? raw.createdAt ?? EPOCH,
    lastActivityAt: lastActivityOf(raw),
  };
}
