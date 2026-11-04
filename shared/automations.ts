// T3 Code scheduled tasks, as the Agents page shows them.

export type AutomationRunStatus = "running" | "succeeded" | "failed";

export type AutomationKind = "routine" | "reminder" | "webhook";

export interface AutomationWebhook {
  /** Public URL through T3 Connect, with its token; null when T3 Connect is off. */
  url: string | null;
  /** T3 checks a signature (a secret is stored). */
  signed: boolean;
}

export interface Automation {
  /** The T3 scheduled task id. */
  id: string;
  kind: AutomationKind;
  /** Without the "Reminder:" prefix. */
  title: string;
  projectId: string;
  /** "No project" when T3 has none. */
  project: string;
  /** "Every 15 min", "Weekdays 9:00", "Webhook"... */
  scheduleLabel: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: AutomationRunStatus | null;
  lastRunError: string | null;
  /** The bound thread, else the newest run thread, else null. */
  threadId: string | null;
  model: string | null;
  /** Set only for kind "webhook". */
  webhook: AutomationWebhook | null;
}

export interface AutomationsResult {
  automations: Automation[];
  /** Threads the Agents grid leaves out: dedicated bound threads and runs of unbound tasks. */
  hiddenThreadIds: string[];
  /** Dedicated threads with no task yet: the agent is still setting the task up, or it failed. */
  setupThreadIds: string[];
}
