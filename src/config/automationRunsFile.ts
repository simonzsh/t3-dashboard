import type { AutomationRun } from "../../shared/automations.ts";
import type { ReadFile } from "./config.ts";

// The same shape as the domain run log: config cannot import from domain.
type RunLog = Record<string, AutomationRun[]>;

const STATUSES = new Set(["running", "waiting", "succeeded", "failed", "unknown"]);
const isText = (value: unknown): value is string => typeof value === "string";
const isTextOrNull = (value: unknown): value is string | null => value === null || isText(value);

function isRun(value: unknown): value is AutomationRun {
  if (!value || typeof value !== "object") return false;
  const run = value as Record<string, unknown>;
  return isTextOrNull(run.threadId) && isText(run.startedAt) && isTextOrNull(run.finishedAt) && isTextOrNull(run.error) && isText(run.status) && STATUSES.has(run.status);
}

// A missing or broken file means an empty history: it builds up again from the live threads.
export function readAutomationRuns(file: string, readFile: ReadFile): RunLog {
  try {
    const raw = JSON.parse(readFile(file)) as { tasks?: unknown } | null;
    const tasks = raw?.tasks;
    if (!tasks || typeof tasks !== "object" || Array.isArray(tasks)) return {};
    return Object.fromEntries(Object.entries(tasks).filter(([, runs]) => Array.isArray(runs)).map(([id, runs]) => [id, (runs as unknown[]).filter(isRun)]));
  } catch {
    return {};
  }
}

export const automationRunsText = (log: RunLog): string => `${JSON.stringify({ version: 1, tasks: log }, null, 2)}\n`;
