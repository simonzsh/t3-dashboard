import type { DashboardProvider, ModelSelection, SaveNewsBody } from "../../../../shared/api.ts";
import { NEWS_DEFAULT_MODEL, NEWS_LANGUAGES, isTimeOfDay, type NewsArticleSummary, type NewsFrequency, type NewsLanguage, type NewsSettings, type NewsTask } from "../../../../shared/news.ts";
import { isUnseenAt, type SeenState } from "../../../../shared/seen.ts";
import { WEEKDAY_NAMES, WEEKDAY_ORDER } from "../new-thread/automationForm.ts";
import { presetSelection } from "../new-thread/newAgent.ts";

/** The article languages the dropdown offers. */
export const LANGUAGES: ReadonlyArray<{ id: NewsLanguage; label: string }> = NEWS_LANGUAGES.map((id) => ({ id, label: id }));

/** Monday first; the value is the JS weekday (0 = Sunday). */
export const WEEKDAYS: ReadonlyArray<{ id: string; label: string }> = WEEKDAY_ORDER.map((day) => ({ id: String(day), label: WEEKDAY_NAMES[day] }));

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
  if (!isTimeOfDay(form.timeOfDay)) return { error: "Pick a time of day." };
  if (!form.selection) return { error: "Pick a model." };
  return { body: { enabled: form.enabled, frequency: form.frequency, weekday: form.weekday, timeOfDay: form.timeOfDay, language: form.language, modelSelection: form.selection } };
}

/** The saved model, else the news default if offered, else T3's default, else the first model. */
export const pickModel = (settings: NewsSettings, providers: DashboardProvider[], fallback: ModelSelection | null): ModelSelection | null =>
  settings.modelSelection ?? presetSelection(undefined, providers, NEWS_DEFAULT_MODEL, fallback);

/** What a first Run now saves when no routine exists yet: the shown settings and the model the dialog would pick. */
export function firstRunBody(settings: NewsSettings, providers: DashboardProvider[], fallback: ModelSelection | null): SaveNewsBody | null {
  const result = toBody(formFromSettings(settings, pickModel(settings, providers, fallback)));
  return "body" in result ? result.body : null;
}

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

/** The line above the list: the next run and how the last one went. Empty when there is no schedule; a run in progress shows in the list. */
const TIME = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const WEEKDAY_SHORT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const MONTH_DAY = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });

/** When the next article comes, as short as the date allows: "today 7:00 AM", "tomorrow 7:00 AM", "Mon 7:00 AM", "Nov 20". */
export function nextRunLabel(at: Date, now: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(at) - day(now)) / 86_400_000);
  if (days === 0) return `today ${TIME.format(at)}`;
  if (days === 1) return `tomorrow ${TIME.format(at)}`;
  if (days > 1 && days < 7) return `${WEEKDAY_SHORT.format(at)} ${TIME.format(at)}`;
  return MONTH_DAY.format(at);
}

/** The line above the list: the next article, or a failed last run. Empty when there is no schedule; a run in progress shows in the list. */
export function statusLine(task: NewsTask | null, now: Date): string {
  if (!task || !task.enabled) return "";
  const next = task.nextRunAt ? `Next: ${nextRunLabel(new Date(task.nextRunAt), now)}` : "";
  const failed = task.lastRunStatus === "failed" ? "Last run failed" : "";
  return [next, failed].filter(Boolean).join(" · ");
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
  return isUnseenAt(id, at, seen);
}

export const unreadNewsCount = (articles: readonly NewsArticleSummary[], seen: SeenState): number => articles.filter((a) => isUnreadArticle(a, seen)).length;

/** The mark to send for the article in front of the user. On a phone the list alone shows no article. */
export function readTarget(articles: readonly NewsArticleSummary[], date: string | null, onList: boolean): { id: string; at: string } | null {
  const article = onList ? undefined : articles.find((a) => a.date === date);
  return article ? newsMark(article) : null;
}

export const SEARCH_DEBOUNCE_MS = 200;

/** The articles whose date is in `dates`, in list order. Null (no search, or no answer yet) keeps them all. */
export const filterArticles = (articles: readonly NewsArticleSummary[], dates: readonly string[] | null): NewsArticleSummary[] =>
  dates === null ? [...articles] : articles.filter((a) => dates.includes(a.date));
