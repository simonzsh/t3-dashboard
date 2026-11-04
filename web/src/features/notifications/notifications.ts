import { later, type SeenState } from "../../../../shared/seen.ts";
import { agentStatus, threadState, type AgentStatus } from "../../../../shared/status.ts";
import type { DashboardThread } from "../../../../shared/threads.ts";
import type { BadgeVariant } from "../../ui/index.ts";

export type NotifyKind = "waiting" | "finished";

export interface NotifyEntry {
  thread: DashboardThread;
  kind: NotifyKind;
  tone: BadgeVariant;
  label: string;
}

function waitingLabel(t: DashboardThread): string {
  if (t.pending?.category === "approval") return "Needs approval";
  return t.pending?.category === "user-input" ? "Needs your input" : "Waiting";
}

function finishedLabel(t: DashboardThread): string {
  if (threadState(t) === "error") return "Failed";
  return t.status === "cancelled" || t.status === "interrupted" ? "Cancelled" : "Finished";
}

// A thread is unseen while its last activity is newer than the baseline and its read mark.
// A read mark comes from opening the thread or from "Mark as read".
export const isUnseen = (t: DashboardThread, seen: SeenState) => t.lastActivityAt.localeCompare(later(seen.since, seen.seen[t.id] ?? "")) > 0;

function entryOf(t: DashboardThread, kind: NotifyKind): NotifyEntry {
  if (kind === "waiting") return { thread: t, kind, tone: "waiting", label: waitingLabel(t) };
  return { thread: t, kind, tone: threadState(t) === "error" ? "error" : "done", label: finishedLabel(t) };
}

export const badgeText = (n: number): string => (n > 9 ? "9+" : String(n));

// The T3 clock, not the browser's, so a device with a skewed clock hides nothing and shows nothing extra.
export const baselineOf = (threads: DashboardThread[]): string => threads.map((t) => t.lastActivityAt).reduce(later, "") || new Date().toISOString();

export const statusMap = (threads: DashboardThread[]): Map<string, AgentStatus> => new Map(threads.map((t) => [t.id, agentStatus(t)]));

/** Threads that just started waiting or just ended a run. Threads missing from `prev` are new, not changed. */
export function transitions(prev: Map<string, AgentStatus> | null, threads: DashboardThread[]): NotifyEntry[] {
  if (!prev) return [];
  const out: NotifyEntry[] = [];
  for (const t of threads) {
    const before = prev.get(t.id);
    const now = agentStatus(t);
    if (before === undefined || before === now) continue;
    if (now === "waiting") out.push(entryOf(t, "waiting"));
    else if (now === "finished" && (before === "working" || before === "waiting")) out.push(entryOf(t, "finished"));
  }
  return out;
}
