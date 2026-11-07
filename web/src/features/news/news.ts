import type { DashboardProvider, ModelSelection, NewsSettings, NewsTask, SaveNewsBody } from "../../../../shared/api.ts";
import type { NewsArticleSummary } from "../../../../shared/news.ts";
import { later, type SeenState } from "../../../../shared/seen.ts";
import { formatMessageTime, relativeTime } from "../../lib/format.ts";
import { NEWS_DEFAULT_MODEL } from "../../../../shared/news.ts";
import { presetSelection } from "../new-thread/newAgent.ts";

// The same limits as the server, so a bad form fails before the request.
const TOPICS_MAX = 10;
const TOPIC_MAX = 60;
const LANGUAGE_MAX = 40;

export interface NewsForm {
  timeOfDay: string;
  /** One topic per line. */
  topics: string;
  language: string;
  selection: ModelSelection | null;
}

export function topicsFromText(text: string): string[] {
  const seen = new Set<string>();
  return text.split("\n").map((t) => t.trim()).filter((t) => {
    const key = t.toLowerCase();
    if (t === "" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const formFromSettings = (settings: NewsSettings, selection: ModelSelection | null): NewsForm => ({
  timeOfDay: settings.timeOfDay,
  topics: settings.topics.join("\n"),
  language: settings.language,
  selection,
});

export function toBody(form: NewsForm): { body: SaveNewsBody } | { error: string } {
  const topics = topicsFromText(form.topics);
  const language = form.language.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.timeOfDay)) return { error: "Pick a time of day." };
  if (topics.length === 0) return { error: "Add at least one topic." };
  if (topics.length > TOPICS_MAX) return { error: `Use at most ${TOPICS_MAX} topics.` };
  if (topics.some((t) => t.length > TOPIC_MAX)) return { error: `Keep each topic under ${TOPIC_MAX} characters.` };
  if (language === "") return { error: "Name the language of the articles." };
  if (language.length > LANGUAGE_MAX) return { error: `Keep the language under ${LANGUAGE_MAX} characters.` };
  if (!form.selection) return { error: "Pick a model." };
  return { body: { timeOfDay: form.timeOfDay, topics, language, modelSelection: form.selection } };
}

/** The saved model, else the news default if offered, else T3's default, else the first model. */
export const pickModel = (settings: NewsSettings, providers: DashboardProvider[], fallback: ModelSelection | null): ModelSelection | null =>
  settings.modelSelection ?? presetSelection(undefined, providers, NEWS_DEFAULT_MODEL, fallback);

/** One line under the page title: when the next article comes and how the last run went. */
export function statusLine(task: NewsTask | null, now: Date): string {
  if (!task) return "Not scheduled yet. Open News settings and save to start the daily news.";
  if (!task.enabled) return "Paused. Resume it in Automations.";
  const parts = [`Next article ${task.nextRunAt ? formatMessageTime(task.nextRunAt) : "not planned"}`];
  if (task.lastRunStatus === "running") parts.push("Running now");
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
