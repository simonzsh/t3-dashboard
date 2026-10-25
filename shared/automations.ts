// t3-agent routines and reminders.

export type AutomationSchedule = { kind: "cron"; cron: string; timeZone: string; label: string } | { kind: "once"; at: string };

export interface Automation {
  id: string;
  brain: string;
  kind: "routine" | "reminder";
  title: string;
  schedule: AutomationSchedule;
  nextRunAt: string | null;
  threadId: string | null;
  model: string | null;
}

export interface BrainStatus {
  name: string;
  ok: boolean;
  error: string | null;
  problems: number;
}

export interface AutomationsResult {
  automations: Automation[];
  brains: BrainStatus[];
}
