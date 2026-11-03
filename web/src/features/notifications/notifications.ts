import { agentStatus, threadState, type AgentStatus } from "../../../../shared/status.ts";
import type { DashboardThread } from "../../../../shared/threads.ts";
import type { Store } from "../../lib/storage.ts";
import type { BadgeVariant } from "../../ui/index.ts";

export const NOTIFY_LIMIT = 20;
const SEEN_CAP = 200;
const KEY = "t3-dashboard-notifications-seen";

export type NotifyKind = "waiting" | "finished";

export interface NotifyEntry {
  thread: DashboardThread;
  kind: NotifyKind;
  tone: BadgeVariant;
  label: string;
  unseen: boolean;
}

/** `since`: the baseline of the first visit. `seen`: thread id -> its lastActivityAt when it was opened. */
export interface SeenState {
  since: string;
  seen: Record<string, string>;
}

const newest = (a: DashboardThread, b: DashboardThread) => b.lastActivityAt.localeCompare(a.lastActivityAt);
const later = (a: string, b: string) => (a.localeCompare(b) >= 0 ? a : b);

function waitingLabel(t: DashboardThread): string {
  if (t.pending?.category === "approval") return "Needs approval";
  return t.pending?.category === "user-input" ? "Needs your input" : "Waiting";
}

function finishedLabel(t: DashboardThread): string {
  if (threadState(t) === "error") return "Failed";
  return t.status === "cancelled" || t.status === "interrupted" ? "Cancelled" : "Finished";
}

// A finished thread is unseen while it finished after the baseline and after the last time it was opened.
const isUnseen = (t: DashboardThread, seen: SeenState) => t.lastActivityAt.localeCompare(later(seen.since, seen.seen[t.id] ?? "")) > 0;

function entryOf(t: DashboardThread, kind: NotifyKind, seen: SeenState | null): NotifyEntry {
  if (kind === "waiting") return { thread: t, kind, tone: "waiting", label: waitingLabel(t), unseen: true };
  return { thread: t, kind, tone: threadState(t) === "error" ? "error" : "done", label: finishedLabel(t), unseen: seen ? isUnseen(t, seen) : true };
}

export function notifyEntries(threads: DashboardThread[], seen: SeenState): NotifyEntry[] {
  const pick = (status: AgentStatus) => threads.filter((t) => agentStatus(t) === status).sort(newest);
  return [...pick("waiting").map((t) => entryOf(t, "waiting", seen)), ...pick("finished").map((t) => entryOf(t, "finished", seen))].slice(0, NOTIFY_LIMIT);
}

export function unseenCount(threads: DashboardThread[], seen: SeenState): number {
  return threads.filter((t) => {
    const status = agentStatus(t);
    return status === "waiting" || (status === "finished" && isUnseen(t, seen));
  }).length;
}

export const badgeText = (n: number): string => (n > 9 ? "9+" : String(n));

export const markSeen = (seen: SeenState, id: string, at: string): SeenState => ({ ...seen, seen: { ...seen.seen, [id]: at } });

export const statusMap = (threads: DashboardThread[]): Map<string, AgentStatus> => new Map(threads.map((t) => [t.id, agentStatus(t)]));

/** Threads that just started waiting or just ended a run. Threads missing from `prev` are new, not changed. */
export function transitions(prev: Map<string, AgentStatus> | null, threads: DashboardThread[]): NotifyEntry[] {
  if (!prev) return [];
  const out: NotifyEntry[] = [];
  for (const t of threads) {
    const before = prev.get(t.id);
    const now = agentStatus(t);
    if (before === undefined || before === now) continue;
    if (now === "waiting") out.push(entryOf(t, "waiting", null));
    else if (now === "finished" && (before === "working" || before === "waiting")) out.push(entryOf(t, "finished", null));
  }
  return out;
}

// Anything unexpected in storage gives a fresh state, never an exception.
export function loadSeen(storage: Store | null, threads: DashboardThread[] | null): SeenState {
  try {
    const data: unknown = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (data && typeof data === "object" && typeof (data as SeenState).since === "string" && (data as SeenState).since) {
      const marks = (data as SeenState).seen;
      const seen = Object.fromEntries(Object.entries(marks && typeof marks === "object" ? marks : {}).filter(([, v]) => typeof v === "string"));
      return { since: (data as SeenState).since, seen };
    }
  } catch {
    // Fall through to a fresh baseline.
  }
  // An empty `since` waits for live threads, so the baseline uses the T3 clock, not the browser's.
  if (!threads) return { since: "", seen: {} };
  const fresh = { since: threads.map((t) => t.lastActivityAt).reduce(later, "") || new Date().toISOString(), seen: {} };
  saveSeen(storage, fresh);
  return fresh;
}

/** Drops marks the baseline hides and keeps the newest ones. Dropped marks move the baseline up, so they stay seen. */
export function prune({ since, seen }: SeenState): SeenState {
  const kept = Object.entries(seen)
    .filter(([, at]) => at.localeCompare(since) > 0)
    .sort(([, a], [, b]) => b.localeCompare(a));
  const dropped = kept[SEEN_CAP]?.[1];
  return { since: dropped ? later(since, dropped) : since, seen: Object.fromEntries(kept.slice(0, SEEN_CAP)) };
}

export function saveSeen(storage: Store | null, seen: SeenState): void {
  try {
    storage?.setItem(KEY, JSON.stringify(prune(seen)));
  } catch {
    // Storage full or blocked: the marks only live for this session.
  }
}
