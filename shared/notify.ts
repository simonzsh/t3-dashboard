import { agentStatus, threadState, type AgentStatus } from "./status.ts";
import type { DashboardThread } from "./threads.ts";

export type NotifyKind = "waiting" | "finished";
/** The badge look of an alert: the web maps it to its own badge variant. */
export type NotifyTone = "waiting" | "done" | "error";

export interface NotifyEntry {
  thread: DashboardThread;
  kind: NotifyKind;
  tone: NotifyTone;
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

function entryOf(t: DashboardThread, kind: NotifyKind): NotifyEntry {
  if (kind === "waiting") return { thread: t, kind, tone: "waiting", label: waitingLabel(t) };
  return { thread: t, kind, tone: threadState(t) === "error" ? "error" : "done", label: finishedLabel(t) };
}

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
