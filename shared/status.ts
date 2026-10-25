import type { DashboardThread } from "./api.ts";

// T3 Code thread statuses: one model for the server and the web.
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set(["preparing", "queued", "starting", "running", "waiting"]);
// Union of the old server list and the old web list: failed and cancelled threads also stay on the board as finished.
export const FINISHED_STATUSES: ReadonlySet<string> = new Set(["completed", "interrupted", "failed", "cancelled", "rolled_back"]);
// Status spellings of a subagent or a tool call that mean it failed.
export const FAILED_STATUSES: ReadonlySet<string> = new Set(["failed", "interrupted", "cancelled", "canceled", "error", "errored"]);
// Run statuses (not thread statuses): a queued run has not started yet.
export const RUNNING_RUN_STATUSES: ReadonlySet<string> = new Set([...ACTIVE_STATUSES].filter((status) => status !== "queued"));

type ThreadFields = Pick<DashboardThread, "status" | "pending" | "activeRunId" | "backgroundWork" | "lastError">;

export type AgentStatus = "waiting" | "working" | "finished" | "idle";
export type ThreadState = "waiting" | "running" | "done" | "error" | "idle";

/** A run is in progress: it can be stopped or steered (background subagents alone cannot). */
export const runActive = (t: Pick<ThreadFields, "status" | "activeRunId">) => ACTIVE_STATUSES.has(t.status) || t.activeRunId !== null;
const isWorking = (t: ThreadFields) => runActive(t) || t.backgroundWork;
export const hasFailed = (t: Pick<ThreadFields, "status" | "lastError">) => t.status === "failed" || t.lastError !== null;

export function agentStatus(t: ThreadFields): AgentStatus {
  if (t.pending) return "waiting";
  if (isWorking(t)) return "working";
  return FINISHED_STATUSES.has(t.status) ? "finished" : "idle";
}

export function threadState(t: ThreadFields): ThreadState {
  if (t.pending) return "waiting";
  if (isWorking(t)) return "running";
  if (hasFailed(t)) return "error";
  return FINISHED_STATUSES.has(t.status) ? "done" : "idle";
}
