// T3 Code scheduled tasks, as the Agents page shows them.

export type AutomationRunStatus = "running" | "succeeded" | "failed";

export type AutomationKind = "routine" | "reminder" | "webhook";

export interface AutomationWebhook {
  /** Public URL through T3 Connect, with its token; null when T3 Connect is off. */
  url: string | null;
  /** T3 checks a signature (a secret is stored). */
  signed: boolean;
}

export type WebhookFilter =
  | { path: string; op: "equals" | "notEquals" | "startsWith"; value: string }
  | { path: string; op: "in"; value: string[] }
  | { path: string; op: "exists" };

export interface WebhookSignature {
  header: string;
  encoding: "hex" | "base64";
  prefix: string;
}

/** What GitHub sends with a signed delivery. */
export const GITHUB_SIGNATURE: WebhookSignature = { header: "x-hub-signature-256", encoding: "hex", prefix: "sha256=" };

export type RoutineSchedule =
  /** Whole minutes, 1 to 525600. */
  | { type: "interval"; everyMinutes: number }
  /** "HH:MM" in the T3 host time zone; no weekday (or all seven) means every day. 0 is Sunday. */
  | { type: "fixed_time"; timeOfDay: string; weekdays: number[] };

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
