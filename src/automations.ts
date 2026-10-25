import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Cron } from "croner";
import { parse } from "yaml";
import type { Automation, AutomationsResult, BrainStatus } from "../shared/api.ts";
import { loadBrains } from "./brains.ts";
import type { Brain } from "./brains.ts";
import { cronLabel } from "./cronLabel.ts";

export interface AutomationsOptions {
  configDir: string;
  now: () => Date;
  projectTitle: (projectId: string) => string | null;
}

const MAX_TITLE = 80;
// t3-agent keeps a due reminder up to 24 h while its thread is busy (REMINDER_WAIT_LIMIT_HOURS).
const PAST_REMINDER_MS = 24 * 3_600_000;

type Raw = Record<string, unknown>;
const isObject = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

// Missing or broken state files only lose the extras: the jobs still show.
function readState(workspace: string, file: string): Raw {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(workspace, "state", file), "utf8"));
    return isObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function toAutomation(id: string, job: Raw, brain: string, state: { threads: Raw; runs: Raw }, now: Date): Automation | null {
  const schedule = isObject(job.schedule) ? job.schedule : {};
  const target = isObject(job.target) ? job.target : {};
  const engine = isObject(job.engine) ? job.engine : {};
  const threadEntry = isObject(state.threads[id]) ? state.threads[id] : {};
  const threadEngine = isObject(threadEntry.engine) ? threadEntry.engine : {};
  const lastRunAt = text(state.runs[id]);
  const title = text(target.newThread) ?? text(job.prompt)?.trim().split("\n")[0]?.trim().slice(0, MAX_TITLE) ?? id;
  const model = text(engine.model) ?? text(threadEngine.model);
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
  if (!workspace || !statSync(workspace, { throwIfNoEntry: false })?.isDirectory()) {
    return { status: { name, ok: false, error: brain.error ?? "Brain folder not found", problems: 0 }, automations: [] };
  }
  const now = options.now();
  const state = { threads: readState(workspace, "routine-threads.json"), runs: readState(workspace, "runs.json") };
  let files: string[] = [];
  try {
    files = readdirSync(join(workspace, "jobs")).filter((file) => file.endsWith(".yaml")).sort();
  } catch {
    // No jobs folder: the brain has no job yet.
  }
  let problems = 0;
  const automations: Automation[] = [];
  for (const file of files) {
    try {
      const job: unknown = parse(readFileSync(join(workspace, "jobs", file), "utf8"));
      if (!isObject(job)) throw new Error("Invalid job");
      const item = toAutomation(file.slice(0, -".yaml".length), job, name, state, now);
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
