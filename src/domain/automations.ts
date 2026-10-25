import { basename, dirname } from "node:path";
import { Cron } from "croner";
import type { Automation, AutomationsResult, BrainStatus } from "../../shared/api.ts";
import { cronLabel } from "./cronLabel.ts";
import { loadBrains, readWorkspace, type Brain, type Workspace } from "../integrations/t3-agent/files.ts";
import type { Job } from "../integrations/t3-agent/schemas.ts";

export interface AutomationsOptions {
  configDir: string;
  now: () => Date;
  projectTitle: (projectId: string) => string | null;
}

const MAX_TITLE = 80;
// t3-agent keeps a due reminder up to 24 h while its thread is busy (REMINDER_WAIT_LIMIT_HOURS).
const PAST_REMINDER_MS = 24 * 3_600_000;

const text = (value: string | undefined): string | null => (value !== undefined && value.trim() !== "" ? value : null);

function toAutomation(id: string, job: Job, brain: string, state: Workspace, now: Date): Automation | null {
  const { schedule = {}, target = {}, engine = {} } = job;
  const threadEntry = state.threads[id] ?? {};
  const lastRunAt = text(state.runs[id]);
  const title = text(target.newThread) ?? text(job.prompt)?.trim().split("\n")[0]?.trim().slice(0, MAX_TITLE) ?? id;
  const model = text(engine.model) ?? text(threadEntry.engine?.model);
  const common = { id, brain, title, model };

  const cron = text(schedule.cron);
  if (cron) {
    const timeZone = text(schedule.timeZone) ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Invalid schedules throw: the caller counts the job as a problem. A null result is a past reminder.
    const next = new Cron(cron, { timezone: timeZone }).nextRun(now);
    return {
      ...common,
      kind: "routine",
      schedule: { kind: "cron", cron, timeZone, label: cronLabel(cron) },
      nextRunAt: next?.toISOString() ?? null,
      threadId: text(threadEntry.threadId),
    };
  }

  const at = text(schedule.at);
  const atMs = at ? Date.parse(at) : NaN;
  // Like t3-agent, a date without a time is not a valid moment.
  if (!at || !at.includes("T") || Number.isNaN(atMs)) throw new Error("Invalid schedule");
  if (lastRunAt || atMs < now.getTime() - PAST_REMINDER_MS) return null;
  return { ...common, kind: "reminder", schedule: { kind: "once", at }, nextRunAt: at, threadId: text(target.thread) };
}

function readBrain(brain: Brain, options: AutomationsOptions): { status: BrainStatus; automations: Automation[] } {
  const { workspace } = brain;
  const fallback = workspace ? basename(dirname(workspace)) : brain.name;
  const name = (brain.projectId && options.projectTitle(brain.projectId)) || fallback;
  const files = workspace ? readWorkspace(workspace) : null;
  if (!files) {
    return { status: { name, ok: false, error: brain.error ?? "Brain folder not found", problems: 0 }, automations: [] };
  }
  const now = options.now();
  let problems = 0;
  const automations: Automation[] = [];
  for (const { id, job } of files.jobs) {
    if (!job) {
      problems++;
      continue;
    }
    try {
      const item = toAutomation(id, job, name, files, now);
      if (item) automations.push(item);
    } catch {
      problems++;
    }
  }
  return { status: { name, ok: true, error: null, problems }, automations };
}

export function readAutomations(options: AutomationsOptions): AutomationsResult {
  const results = loadBrains(options.configDir).map((brain) => {
    try {
      return readBrain(brain, options);
    } catch {
      // One unreadable brain folder must not hide the others.
      return { status: { name: brain.name, ok: false, error: "Brain folder unreadable", problems: 0 }, automations: [] };
    }
  });
  return {
    automations: results.flatMap((result) => result.automations),
    brains: results.map((result) => result.status),
  };
}
