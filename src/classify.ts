import type { DashboardThread, PendingCategory } from "../shared/api.ts";
import type { RawThread } from "./t3/types.ts";

const PREVIEW_MAX = 280;
const EPOCH = new Date(0).toISOString();

export const ACTIVE_STATUSES = new Set(["preparing", "queued", "starting", "running", "waiting"]);
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
    status: raw.status ?? "idle",
    settled: isSettled(raw, now),
    pending: pending ? { category: categoryOf(pending.kind) } : null,
    activeRunId: raw.activeRunId ?? null,
    backgroundWork: hasBackgroundWork(raw),
    pendingTasks: (raw.pendingBackgroundTasks?.length ?? 0) > 0,
    lastError: raw.lastError ?? null,
    preview: previewOf(raw.latestVisibleMessage),
    pinned: raw.pinnedAt != null,
    lastActivityAt: lastActivityOf(raw),
  };
}
