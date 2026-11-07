import { NEWS_DEFAULTS, type NewsSettings } from "../../shared/news.ts";
import type { ModelSelection } from "../../shared/threads.ts";
import type { ReadFile } from "./config.ts";

export interface StoredNews {
  settings: NewsSettings;
  taskId: string | null;
  taskCreatedAt: string | null;
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isTimeOfDay = (value: unknown): value is string => typeof value === "string" && TIME_OF_DAY.test(value);
export const isWeekday = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6;
const ARTICLE_NAME = /^\d{4}-\d{2}-\d{2}\.md$/;
const fields = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);

function selectionOf(value: unknown): ModelSelection | null {
  const { instanceId, model, options } = fields(value);
  if (typeof instanceId !== "string" || typeof model !== "string" || !instanceId || !model) return null;
  return { instanceId, model, ...(Array.isArray(options) && { options: options as NonNullable<ModelSelection["options"]> }) };
}

// Each field falls back to its default alone: one bad field must not reset the rest.
export function readNews(file: string, readFile: ReadFile): StoredNews {
  let root: Record<string, unknown> = {};
  try {
    root = fields(JSON.parse(readFile(file)));
  } catch {
    // A missing or broken file means the defaults.
  }
  const settings = fields(root.settings);
  const topics = Array.isArray(settings.topics) ? settings.topics.filter((topic): topic is string => typeof topic === "string" && topic.trim() !== "") : [];
  return {
    settings: {
      enabled: typeof settings.enabled === "boolean" ? settings.enabled : NEWS_DEFAULTS.enabled,
      frequency: settings.frequency === "daily" || settings.frequency === "weekly" ? settings.frequency : NEWS_DEFAULTS.frequency,
      weekday: isWeekday(settings.weekday) ? settings.weekday : NEWS_DEFAULTS.weekday,
      timeOfDay: isTimeOfDay(settings.timeOfDay) ? settings.timeOfDay : NEWS_DEFAULTS.timeOfDay,
      topics: topics.length > 0 ? topics : [...NEWS_DEFAULTS.topics],
      language: text(settings.language) ?? NEWS_DEFAULTS.language,
      modelSelection: selectionOf(settings.modelSelection),
    },
    taskId: text(root.taskId),
    taskCreatedAt: text(root.taskCreatedAt),
  };
}

export const newsText = (stored: StoredNews): string => `${JSON.stringify({ version: 1, ...stored }, null, 2)}\n`;

/** A file name the agent could have written: `YYYY-MM-DD.md`. */
export const isArticleName = (name: string): boolean => ARTICLE_NAME.test(name) && isArticleDate(name.slice(0, 10));

/** A real calendar date, so `2026-02-31` is refused. */
export function isArticleDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}
