// T3 Code scheduled tasks, as the Agents page shows them.

import type { ThreadState } from "./status.ts";
import type { ModelSelection, RuntimeMode } from "./threads.ts";

export type AutomationRunStatus = "running" | "succeeded" | "failed";

/** A run as the dashboard last saw it. "waiting": the agent asks the user something. */
export type AutomationRunOutcome = "running" | "waiting" | "succeeded" | "failed" | "unknown";

/** The outcome a run thread shows, for the server and the web. An idle thread says nothing. */
export const RUN_OUTCOMES: Record<ThreadState, AutomationRunOutcome | null> = { waiting: "waiting", running: "running", error: "failed", done: "succeeded", idle: null };

export interface AutomationRun {
  /** The session of the run; null when T3 failed before it opened one. */
  threadId: string | null;
  /** ISO. Thread creation for an unbound task, T3's lastRunAt for a bound one. */
  startedAt: string;
  /** ISO; null while it runs, or when the end is not known. */
  finishedAt: string | null;
  status: AutomationRunOutcome;
  error: string | null;
}

export type AutomationKind = "routine" | "reminder" | "webhook";

export interface AutomationWebhook {
  /** Public URL through T3 Connect, with its token; null when T3 Connect is off. */
  url: string | null;
  /** T3 checks a signature (a secret is stored). */
  signed: boolean;
  filters: WebhookFilter[];
  /** How T3 reads the signature; the secret never leaves T3. Null when unsigned. */
  signature: WebhookSignature | null;
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
  modelSelection: ModelSelection | null;
  /** The task prompt as stored in T3. */
  prompt: string;
  /** Routine only, in the units of the form. */
  schedule: RoutineSchedule | null;
  runtimeMode: RuntimeMode | null;
  /** Bound to a thread: it runs there, so its project is fixed. */
  bound: boolean;
  /** Set only for kind "webhook". */
  webhook: AutomationWebhook | null;
  /** Newest first, at most 20. Best effort: the dashboard builds it as it sees the threads. */
  runs: AutomationRun[];
}

export interface AutomationsResult {
  automations: Automation[];
  /** Threads tied to a task (run threads, dedicated bound threads, setup threads): the UI marks them with the automation icon. */
  automationThreadIds: string[];
  /** Dedicated threads with no task yet: the agent is still setting the task up, or it failed. */
  setupThreadIds: string[];
}
