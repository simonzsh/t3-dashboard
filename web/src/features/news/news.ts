import type { DashboardProvider, ModelSelection, NewsSettings, NewsTask, SaveNewsBody } from "../../../../shared/api.ts";
import type { NewsArticleSummary } from "../../../../shared/news.ts";
import { later, type SeenState } from "../../../../shared/seen.ts";
import { formatMessageTime, relativeTime } from "../../lib/format.ts";
import { NEWS_DEFAULT_MODEL, NEWS_TOPICS } from "../../../../shared/news.ts";
import { presetSelection } from "../new-thread/newAgent.ts";

// The same limits as the server, so a bad form fails before the request.
export const TOPICS_MAX = 10;
const TOPIC_MAX = 60;
const LANGUAGE_MAX = 40;

export type NewsFrequency = SaveNewsBody["frequency"];

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
  /** The checked topics. */
  topics: string[];
  /** Topics outside the presets, in the order they were saved or added. */
  customs: string[];
  language: string;
  selection: ModelSelection | null;
}

const sameTopic = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const findTopic = (list: readonly string[], topic: string) => list.find((t) => sameTopic(t, topic));

/** Every option in display order: the presets, then the custom topics. */
export const topicOptions = (customs: readonly string[]): string[] => [...NEWS_TOPICS, ...customs];

/** The checked topics in display order, without repeats. */
export const orderedTopics = (customs: readonly string[], checked: readonly string[]): string[] =>
  topicOptions(customs).filter((option) => checked.some((t) => sameTopic(t, option)));

/** The saved topics outside the presets, deduplicated without case. */
export const customsFrom = (saved: readonly string[]): string[] =>
  saved.reduce<string[]>((all, t) => (findTopic([...NEWS_TOPICS, ...all], t) ? all : [...all, t]), []);

/** Turns a topic on or off. An unchecked topic stays off when the cap is reached. */
export function toggleTopic(form: Pick<NewsForm, "topics" | "customs">, topic: string): string[] {
  const on = form.topics.some((t) => sameTopic(t, topic));
  if (on) return form.topics.filter((t) => !sameTopic(t, topic));
  if (form.topics.length >= TOPICS_MAX) return form.topics;
  return orderedTopics(form.customs, [...form.topics, topic]);
}

/** Adds a custom topic, checked. A name that matches an option checks that option instead. */
export function addTopic(form: Pick<NewsForm, "topics" | "customs">, text: string): { topics: string[]; customs: string[]; error?: string } {
  const name = text.trim();
  const same = { topics: form.topics, customs: form.customs };
  if (name === "") return same;
  if (name.length > TOPIC_MAX) return { ...same, error: `Keep each topic under ${TOPIC_MAX} characters.` };
  if (/\p{Cc}/u.test(name)) return { ...same, error: "Remove special characters from the topic." };
  const existing = findTopic(topicOptions(form.customs), name);
  if (existing && form.topics.includes(existing)) return same;
  if (form.topics.length >= TOPICS_MAX) return { ...same, error: `Use at most ${TOPICS_MAX} topics.` };
  const customs = existing ? form.customs : [...form.customs, name];
  return { customs, topics: orderedTopics(customs, [...form.topics, existing ?? name]) };
}

export const formFromSettings = (settings: NewsSettings, selection: ModelSelection | null): NewsForm => {
  const customs = customsFrom(settings.topics);
  return {
    enabled: settings.enabled,
    frequency: settings.frequency,
    weekday: settings.weekday,
    timeOfDay: settings.timeOfDay,
    topics: orderedTopics(customs, settings.topics),
    customs,
    language: settings.language,
    selection,
  };
};

export function toBody(form: NewsForm): { body: SaveNewsBody } | { error: string } {
  const topics = orderedTopics(form.customs, form.topics);
  const language = form.language.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.timeOfDay)) return { error: "Pick a time of day." };
  if (topics.length === 0) return { error: "Check at least one topic." };
  if (topics.length > TOPICS_MAX) return { error: `Use at most ${TOPICS_MAX} topics.` };
  if (topics.some((t) => t.length > TOPIC_MAX)) return { error: `Keep each topic under ${TOPIC_MAX} characters.` };
  if (language === "") return { error: "Name the language of the articles." };
  if (language.length > LANGUAGE_MAX) return { error: `Keep the language under ${LANGUAGE_MAX} characters.` };
  if (!form.selection) return { error: "Pick a model." };
  return { body: { enabled: form.enabled, frequency: form.frequency, weekday: form.weekday, timeOfDay: form.timeOfDay, topics, language, modelSelection: form.selection } };
}

/** The saved model, else the news default if offered, else T3's default, else the first model. */
export const pickModel = (settings: NewsSettings, providers: DashboardProvider[], fallback: ModelSelection | null): ModelSelection | null =>
  settings.modelSelection ?? presetSelection(undefined, providers, NEWS_DEFAULT_MODEL, fallback);

/** One line under the page title: when the next article comes and how the last run went. */
export function statusLine(task: NewsTask | null, now: Date): string {
  if (!task) return "Not scheduled yet. Open News settings and save to start the news.";
  if (!task.enabled) return "Automatic generation is off. Use Run now to get an article.";
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
