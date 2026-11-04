import type { SeenState } from "../../../../shared/seen.ts";
import { threadState } from "../../../../shared/status.ts";
import { isUnseen } from "../notifications/notifications.ts";
import type { AssignIssueBody, DashboardProject, DashboardProvider, DashboardThread, LinearIssue, ModelDefaults } from "../../../../shared/api.ts";
import { DEFAULT_RUNTIME_MODE, presetSelection } from "../new-thread/newAgent.ts";

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

/** `thread` is null when the ticket has no agent at all. */
export interface RelaunchItem {
  issue: LinearIssue;
  thread: DashboardThread | null;
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
  const relaunch = [...stalled, ...unlinked.filter((i) => i.state.type === "started").map((issue) => ({ issue, thread: null }))];
  return { relaunch: relaunch.sort((a, b) => byPriority(a.issue, b.issue)), upNext: unlinked.filter((i) => i.state.type === "unstarted") };
}

export type TicketStart = { kind: "direct"; project: DashboardProject; body: AssignIssueBody } | { kind: "dialog" };

// Direct only when the team has a saved project and a model is offered; else the user picks in the dialog.
export function ticketStart(issue: LinearIssue, savedProjectId: string, projects: DashboardProject[], providers: DashboardProvider[], defaults: ModelDefaults): TicketStart {
  const project = savedProjectId === "" ? undefined : projects.find((p) => p.id === savedProjectId);
  const modelSelection = project && presetSelection(project, providers, defaults.selection);
  if (!project || !modelSelection) return { kind: "dialog" };
  return { kind: "direct", project, body: { issueId: issue.id, projectId: project.id, text: "", modelSelection, runtimeMode: defaults.runtimeMode ?? DEFAULT_RUNTIME_MODE } };
}
