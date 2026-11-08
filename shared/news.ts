// The daily news: its settings, its T3 task and the articles the agent wrote.
import type { AutomationRunStatus } from "./automations.ts";
import type { ModelSelection } from "./threads.ts";

export type NewsFrequency = "daily" | "weekly";

export interface NewsSettings {
  /** False pauses the T3 task: only Run now writes an article. */
  enabled: boolean;
  frequency: NewsFrequency;
  /** 0-6, 0 = Sunday (JS getDay, same as T3 weekdays). Used when weekly. */
  weekday: number;
  /** "HH:MM" in the time zone of the T3 host. */
  timeOfDay: string;
  language: NewsLanguage;
  modelSelection: ModelSelection | null;
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTimeOfDay = (value: unknown): value is string => typeof value === "string" && TIME_OF_DAY.test(value);
export const isWeekday = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;

export const NEWS_LANGUAGES = ["English", "French"] as const;
export type NewsLanguage = (typeof NEWS_LANGUAGES)[number];

export const NEWS_DEFAULTS: NewsSettings = { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", language: "English", modelSelection: null };

export interface NewsTask {
  id: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunStatus: AutomationRunStatus | null;
  lastRunError: string | null;
}

export interface NewsArticleSummary {
  /** YYYY-MM-DD */
  date: string;
  title: string;
  /** Last change of the file: the web reloads an open article when it moves. */
  mtimeMs: number;
}

export interface NewsState {
  settings: NewsSettings;
  /** Null until the first save, or when T3 does not answer or lost the task. */
  task: NewsTask | null;
  /** Newest first. */
  articles: NewsArticleSummary[];
  /** The run in progress. `threadId` is null when only T3's task status says so. */
  running: NewsRunning | null;
}

export interface NewsRunning {
  threadId: string | null;
  startedAt: string | null;
}

export interface NewsArticle {
  date: string;
  title: string;
  markdown: string;
}

export interface SaveNewsBody {
  enabled: boolean;
  frequency: NewsFrequency;
  weekday: number;
  timeOfDay: string;
  language: NewsLanguage;
  modelSelection: ModelSelection;
}

/** Model used until the user picks one in the settings. */
export const NEWS_DEFAULT_MODEL: ModelSelection = { instanceId: "codex", model: "gpt-6-luna" };
