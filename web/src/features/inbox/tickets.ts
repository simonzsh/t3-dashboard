import type { SeenState } from "../../../../shared/seen.ts";
import { threadState } from "../../../../shared/status.ts";
import { isUnseen } from "../notifications/notifications.ts";
import type { DashboardThread, LinearIssue } from "../../../../shared/api.ts";

const IDENTIFIER = /\b[A-Z][A-Z0-9]*-\d+\b/g;

/** Issue identifiers named in thread titles: assigning an issue titles the thread after it. */
export function linkedIdentifiers(threads: DashboardThread[]): Set<string> {
  return new Set(threads.flatMap((t) => t.title.toUpperCase().match(IDENTIFIER) ?? []));
}

// Linear's 0 means "no priority" and sorts after low.
const rank = (priority: number) => (priority === 0 ? 5 : priority);

const COUNTED_STATES = new Set(["unstarted", "started"]);
const byPriority = (a: LinearIssue, b: LinearIssue) => rank(a.priority) - rank(b.priority) || b.updatedAt.localeCompare(a.updatedAt);

/** Tickets to do or started, without a thread, most urgent first. Other states are hidden everywhere. */
export function ticketsWithoutAgent(issues: LinearIssue[], threads: DashboardThread[]): LinearIssue[] {
  const linked = linkedIdentifiers(threads);
  return issues.filter((i) => COUNTED_STATES.has(i.state.type) && !linked.has(i.identifier.toUpperCase())).sort(byPriority);
}

/** A started ticket whose thread has been finished, read and idle for this long is to relaunch. */
export const IDLE_RELAUNCH_MS = 24 * 3_600_000;

export interface RelaunchItem {
  issue: LinearIssue;
  thread: DashboardThread;
}

export interface TicketPlan {
  relaunch: RelaunchItem[];
  upNext: LinearIssue[];
}

// Only the latest thread of a ticket counts: a newer run means the work already restarted.
function latestThreads(threads: DashboardThread[]): Map<string, DashboardThread> {
  const latest = new Map<string, DashboardThread>();
  for (const t of threads) {
    for (const id of linkedIdentifiers([t])) {
      const known = latest.get(id);
      if (!known || t.lastActivityAt > known.lastActivityAt) latest.set(id, t);
    }
  }
  return latest;
}

export function planTickets(issues: LinearIssue[], threads: DashboardThread[], seen: SeenState, now: Date): TicketPlan {
  const idleBefore = new Date(now.getTime() - IDLE_RELAUNCH_MS).toISOString();
  const idle = (t: DashboardThread) => !t.settled && ["done", "idle"].includes(threadState(t)) && !isUnseen(t, seen) && t.lastActivityAt < idleBefore;
  const unlinked = ticketsWithoutAgent(issues, threads);
  const latest = latestThreads(threads);
  const stalled = issues.flatMap((issue): RelaunchItem[] => {
    const t = latest.get(issue.identifier.toUpperCase());
    return t && issue.state.type === "started" && idle(t) ? [{ issue, thread: t }] : [];
  });
  const once = stalled.filter((r, i) => stalled.findIndex((s) => s.thread === r.thread) === i);
  // A started ticket with no agent is often worked by hand: it leads Up next instead of claiming to be stalled.
  const upNext = [...unlinked].sort((a, b) => Number(b.state.type === "started") - Number(a.state.type === "started") || byPriority(a, b));
  return { relaunch: once.sort((a, b) => byPriority(a.issue, b.issue)), upNext };
}
