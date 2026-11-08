import type { DashboardProvider, ModelSelection, NewsSettings, NewsTask, SaveNewsBody } from "../../../../shared/api.ts";
import type { NewsArticleSummary } from "../../../../shared/news.ts";
import { later, type SeenState } from "../../../../shared/seen.ts";
import { formatMessageTime, relativeTime } from "../../lib/format.ts";
import { NEWS_DEFAULT_MODEL, NEWS_LANGUAGES, type NewsLanguage } from "../../../../shared/news.ts";
import { presetSelection } from "../new-thread/newAgent.ts";

export type NewsFrequency = SaveNewsBody["frequency"];

/** The article languages the dropdown offers. */
export const LANGUAGES: ReadonlyArray<{ id: NewsLanguage; label: string }> = NEWS_LANGUAGES.map((id) => ({ id, label: id }));

/** Monday first; the value is the JS weekday (0 = Sunday). */
export const WEEKDAYS: ReadonlyArray<{ id: string; label: string }> = [
  { id: "1", label: "Monday" },
  { id: "2", label: "Tuesday" },
  { id: "3", label: "Wednesday" },
  { id: "4", label: "Thursday" },
  { id: "5", label: "Friday" },
  { id: "6", label: "Saturday" },
  { id: "0", label: "Sunday" },
];

/** The sentence under the time field. */
export const scheduleHint = (frequency: NewsFrequency, weekday: number): string =>
  `The news runs ${frequency === "weekly" ? `every ${WEEKDAYS.find((d) => d.id === String(weekday))?.label ?? "week"}` : "every day"}. The time is read in the time zone of the machine that runs T3.${frequency === "weekly" ? " Each article covers the last 7 days." : ""}`;

export interface NewsForm {
  enabled: boolean;
  frequency: NewsFrequency;
  weekday: number;
  timeOfDay: string;
  language: NewsLanguage;
  selection: ModelSelection | null;
}

export const formFromSettings = (settings: NewsSettings, selection: ModelSelection | null): NewsForm => {
  return {
    enabled: settings.enabled,
    frequency: settings.frequency,
    weekday: settings.weekday,
    timeOfDay: settings.timeOfDay,
    language: settings.language,
    selection,
  };
};

export function toBody(form: NewsForm): { body: SaveNewsBody } | { error: string } {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.timeOfDay)) return { error: "Pick a time of day." };
  if (!form.selection) return { error: "Pick a model." };
  return { body: { enabled: form.enabled, frequency: form.frequency, weekday: form.weekday, timeOfDay: form.timeOfDay, language: form.language, modelSelection: form.selection } };
}

/** The saved model, else the news default if offered, else T3's default, else the first model. */
export const pickModel = (settings: NewsSettings, providers: DashboardProvider[], fallback: ModelSelection | null): ModelSelection | null =>
  settings.modelSelection ?? presetSelection(undefined, providers, NEWS_DEFAULT_MODEL, fallback);

export const POLL_MS = 60_000;
export const POLL_RUNNING_MS = 5_000;
/** A Run now that shows no thread within this time stops counting as starting. */
export const STARTING_MS = 2 * 60_000;

/** Poll fast while an article is being written. */
export const pollInterval = (writing: boolean): number => (writing ? POLL_RUNNING_MS : POLL_MS);

/** Whether a Run now started at `startedAt` (ms) still counts as starting. Done when the server shows the run or a newer article exists. */
export function isStarting(startedAt: number | null, now: number, newestMtimeMs: number | null): boolean {
  if (startedAt === null || now - startedAt >= STARTING_MS) return false;
  return newestMtimeMs === null || newestMtimeMs < startedAt;
}

/** One line under the page title: when the next article comes and how the last run went. */
export function statusLine(task: NewsTask | null, now: Date, writing = false): string {
  if (!task) return "Not scheduled yet. Open News settings and save to start the news.";
  if (!task.enabled) return "Automatic generation is off. Use Run now to get an article.";
  const parts = [`Next article ${task.nextRunAt ? formatMessageTime(task.nextRunAt) : "not planned"}`];
  if (writing || task.lastRunStatus === "running") parts.push("Writing the article now");
  else if (task.lastRunAt) {
    parts.push(task.lastRunStatus === "failed" ? `Last run failed: ${task.lastRunError ?? "unknown error"}` : `Last run ${relativeTime(task.lastRunAt, now)}`);
  }
  return parts.join(" · ");
}

// UTC on both sides: the date is a calendar day, not an instant, so the browser's zone must not shift it.
const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
// Built from the parts: the separators change with the ICU version.
const parts = (format: Intl.DateTimeFormat, date: string): Record<string, string> =>
  Object.fromEntries(format.formatToParts(new Date(`${date}T00:00:00Z`)).map((p) => [p.type, p.value]));

export function dateLabel(date: string): string {
  const p = parts(DAY, date);
  return `${p.weekday}, ${p.day} ${p.month} ${p.year}`;
}

export function shortDate(date: string): string {
  const p = parts(SHORT_DAY, date);
  return `${p.weekday} ${p.day} ${p.month}`;
}

// Read marks live in the shared seen state (one mark per day), so every device agrees.
export const newsMarkId = (date: string) => `news:${date}`;

/** The mark for an article: its file time, so a re-run on the same day is unread again. */
export const newsMark = (a: Pick<NewsArticleSummary, "date" | "mtimeMs">): { id: string; at: string } => ({ id: newsMarkId(a.date), at: new Date(a.mtimeMs).toISOString() });

export function isUnreadArticle(a: Pick<NewsArticleSummary, "date" | "mtimeMs">, seen: SeenState): boolean {
  const { id, at } = newsMark(a);
  return at.localeCompare(later(seen.since, seen.seen[id] ?? "")) > 0;
}

export const unreadNewsCount = (articles: readonly NewsArticleSummary[], seen: SeenState): number => articles.filter((a) => isUnreadArticle(a, seen)).length;

/** The mark to send for the article in front of the user. On a phone the list alone shows no article. */
export function readTarget(articles: readonly NewsArticleSummary[], date: string | null, onList: boolean): { id: string; at: string } | null {
  const article = onList ? undefined : articles.find((a) => a.date === date);
  return article ? newsMark(article) : null;
}
