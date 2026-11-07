// The daily news brief: its settings, its T3 task and the articles the agent wrote.
import type { AutomationRunStatus } from "./automations.ts";
import type { ModelSelection } from "./threads.ts";

export interface NewsSettings {
  /** "HH:MM" in the time zone of the T3 host. */
  timeOfDay: string;
  topics: string[];
  language: string;
  modelSelection: ModelSelection | null;
}

export const NEWS_DEFAULTS: NewsSettings = { timeOfDay: "07:00", topics: ["Tech", "Software development", "AI"], language: "French", modelSelection: null };

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
}

export interface NewsState {
  settings: NewsSettings;
  /** Null until the first save, or when T3 does not answer or lost the task. */
  task: NewsTask | null;
  /** Newest first. */
  articles: NewsArticleSummary[];
}

export interface NewsArticle {
  date: string;
  title: string;
  markdown: string;
}

export interface SaveNewsBody {
  timeOfDay: string;
  topics: string[];
  language: string;
  modelSelection: ModelSelection;
}
