import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProvider, NewsSettings, NewsTask } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { prune } from "../../../../shared/seen.ts";
import { filterArticles, firstRunBody, isUnreadArticle, newsMark, readTarget, unreadNewsCount, dateLabel, formFromSettings, pickModel, shortDate, statusLine, nextRunLabel, pollInterval, isStarting, STARTING_MS, toBody, scheduleHint, WEEKDAYS, LANGUAGES } from "../../../src/features/news/news.ts";

const provider: DashboardProvider = { instanceId: "provider-a", displayName: "Provider A", models: [{ slug: "model-x", name: "Model X" }, { slug: "model-y", name: "Model Y" }] as never, runtimeModes: [] };
const settings: NewsSettings = { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", language: "French", modelSelection: { instanceId: "provider-a", model: "model-y" } };
const task = (over: Partial<NewsTask> = {}): NewsTask => ({ id: "t", enabled: true, nextRunAt: "2026-11-08T07:00:00.000Z", lastRunAt: null, lastRunStatus: null, lastRunError: null, ...over });
const now = new Date("2026-11-07T12:00:00.000Z");

test("the form shows the saved values", () => {
  const form = formFromSettings(settings, settings.modelSelection);
  assert.deepEqual([form.timeOfDay, form.language, form.selection], ["07:00", "French", settings.modelSelection]);
});

test("a valid form becomes the save body", () => {
  const form = formFromSettings(settings, settings.modelSelection);
  assert.deepEqual(toBody(form), { body: { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", language: "French", modelSelection: settings.modelSelection } });
});

test("the schedule fields go through the form and the body", () => {
  const form = formFromSettings({ ...settings, enabled: false, frequency: "weekly", weekday: 0 }, settings.modelSelection);
  assert.deepEqual([form.enabled, form.frequency, form.weekday], [false, "weekly", 0]);
  const built = toBody(form);
  assert.ok("body" in built);
  assert.deepEqual([built.body.enabled, built.body.frequency, built.body.weekday], [false, "weekly", 0]);
});

test("the weekdays start on Monday and use JS numbers", () => {
  assert.deepEqual(WEEKDAYS.map((d) => d.id), ["1", "2", "3", "4", "5", "6", "0"]);
  assert.equal(WEEKDAYS[6]!.label, "Sunday");
});

test("the schedule hint follows the frequency", () => {
  assert.match(scheduleHint("daily", 1), /runs every day/);
  assert.match(scheduleHint("weekly", 1), /runs every Monday/);
  assert.match(scheduleHint("weekly", 0), /every Sunday/);
});

test("the status line says when automatic generation is off", () => {
  assert.equal(statusLine(task({ enabled: false }), now), "");
});

test("the language choices are English and French", () => {
  assert.deepEqual(LANGUAGES.map((l) => l.label), ["English", "French"]);
});

test("an invalid form names the problem", () => {
  const ok = formFromSettings(settings, settings.modelSelection);
  const error = (over: object) => ("error" in toBody({ ...ok, ...over }) ? (toBody({ ...ok, ...over }) as { error: string }).error : null);
  assert.match(error({ timeOfDay: "" })!, /time/i);
  assert.match(error({ selection: null })!, /model/i);
  assert.equal(error({}), null);
});

test("the stored model wins; otherwise Codex gpt-6-luna, T3's default, then the first model", () => {
  assert.deepEqual(pickModel(settings, [provider], null), settings.modelSelection);
  const none = { ...settings, modelSelection: null };
  assert.deepEqual(pickModel(none, [provider], { instanceId: "provider-a", model: "model-y" }), { instanceId: "provider-a", model: "model-y" });
  const codex: DashboardProvider = { instanceId: "codex", displayName: "Codex", models: [{ slug: "gpt-6-luna", name: "Luna" }] as never, runtimeModes: [] };
  assert.deepEqual(pickModel(none, [provider, codex], { instanceId: "provider-a", model: "model-y" }), { instanceId: "codex", model: "gpt-6-luna" });
  assert.deepEqual(pickModel(settings, [provider, codex], null), settings.modelSelection);
  assert.deepEqual(pickModel(none, [provider], null), { instanceId: "provider-a", model: "model-x" });
  assert.equal(pickModel(none, [], null), null);
});

test("the status line asks for a first save when there is no task", () => {
  assert.equal(statusLine(null, now), "");
});

test("the status line gives the next run and the last run", () => {
  assert.match(statusLine(task(), now), /^Next: tomorrow \S+/);
  // A good last run adds nothing: the line stays short.
  assert.equal(statusLine(task({ lastRunAt: "2026-11-07T09:00:00.000Z", lastRunStatus: "succeeded" }), now), statusLine(task(), now));
});

test("the status line says when the routine is paused or running, and shows a failure", () => {
  assert.equal(statusLine(task({ lastRunStatus: "running", lastRunAt: "2026-11-07T11:59:00.000Z" }), now), statusLine(task(), now));
  assert.match(statusLine(task({ lastRunAt: "2026-11-07T09:00:00.000Z", lastRunStatus: "failed", lastRunError: "No model" }), now), /· Last run failed$/);
});

test("a date reads as a long English date, whatever the time zone", () => {
  assert.equal(dateLabel("2026-11-07"), "Saturday, 7 November 2026");
  assert.equal(dateLabel("2026-01-01"), "Thursday, 1 January 2026");
});

test("the list shows a short date", () => {
  assert.equal(shortDate("2026-11-07"), "Sat 7 Nov");
  assert.equal(shortDate("2026-12-25"), "Fri 25 Dec");
});

const A7 = { date: "2026-11-07", title: "7", mtimeMs: Date.parse("2026-11-07T07:05:00.000Z") };
const A6 = { date: "2026-11-06", title: "6", mtimeMs: Date.parse("2026-11-06T07:05:00.000Z") };
const seenState = (over: Partial<SeenState> = {}): SeenState => ({ since: "2026-11-06T12:00:00.000Z", seen: {}, ...over });

test("a mark uses the day as id and the file time as time", () => {
  assert.deepEqual(newsMark(A7), { id: "news:2026-11-07", at: "2026-11-07T07:05:00.000Z" });
});

test("articles older than the baseline are read; newer ones are unread until marked", () => {
  assert.equal(isUnreadArticle(A6, seenState()), false);
  assert.equal(isUnreadArticle(A7, seenState()), true);
  assert.equal(unreadNewsCount([A7, A6], seenState()), 1);
  assert.equal(unreadNewsCount([A7, A6], seenState({ seen: { "news:2026-11-07": newsMark(A7).at } })), 0);
});

test("a re-run on the same day is unread again", () => {
  const seen = seenState({ seen: { "news:2026-11-07": newsMark(A7).at } });
  assert.equal(isUnreadArticle({ ...A7, mtimeMs: A7.mtimeMs + 60_000 }, seen), true);
});

test("the unread count is zero before the seen state is known", () => {
  assert.equal(unreadNewsCount([A7, A6], { since: "9999", seen: {} }), 0);
});

test("news marks survive pruning with the thread marks", () => {
  const state = prune(seenState({ seen: { "news:2026-11-07": newsMark(A7).at, "thread-1": "2026-11-07T09:00:00.000Z" } }));
  assert.equal(Object.keys(state.seen).length, 2);
});

test("only an article in front of the user is marked: not the phone list", () => {
  assert.deepEqual(readTarget([A7, A6], "2026-11-07", false), newsMark(A7));
  assert.deepEqual(readTarget([A7, A6], "2026-11-06", false), newsMark(A6));
  assert.equal(readTarget([A7, A6], "2026-11-07", true), null);
  assert.equal(readTarget([], null, false), null);
  assert.equal(readTarget([A7], "2026-01-01", false), null);
});

test("the page polls every 5 seconds while an article is written, else every minute", () => {
  assert.equal(pollInterval(true), 5_000);
  assert.equal(pollInterval(false), 60_000);
});

test("a Run now counts as starting until a newer article or 2 minutes", () => {
  assert.equal(isStarting(null, 1000, null), false);
  assert.equal(isStarting(1000, 2000, 500), true);
  assert.equal(isStarting(1000, 2000, null), true);
  assert.equal(isStarting(1000, 2000, 1500), false);
  assert.equal(isStarting(1000, 1000 + STARTING_MS, 500), false);
});

test("the status line never repeats the run shown in the list", () => {
  // The run shows in the list with its loader: the status line never repeats it.
  assert.doesNotMatch(statusLine(task({ lastRunStatus: "running" }), now), /Writing/);
  assert.doesNotMatch(statusLine(task(), now), /Writing/);
  assert.equal(statusLine(task({ enabled: false, lastRunStatus: "running" }), now), "");
});

test("filterArticles keeps the matching dates in list order, and everything without an answer", () => {
  const list = [{ date: "2026-11-07", title: "A", mtimeMs: 2 }, { date: "2026-11-06", title: "B", mtimeMs: 1 }];
  assert.deepEqual(filterArticles(list, ["2026-11-06"]).map((a) => a.date), ["2026-11-06"]);
  assert.deepEqual(filterArticles(list, []), []);
  assert.deepEqual(filterArticles(list, null).map((a) => a.date), ["2026-11-07", "2026-11-06"]);
});

test("a first Run now saves the shown settings with the model the dialog would pick", () => {
  const settingsNone = { ...settings, modelSelection: null };
  const codex: DashboardProvider = { instanceId: "codex", displayName: "Codex", models: [{ slug: "gpt-6-luna", name: "Luna" }] as never, runtimeModes: [] };
  assert.deepEqual(firstRunBody(settingsNone, [provider, codex], null)?.modelSelection, { instanceId: "codex", model: "gpt-6-luna" });
  const body = firstRunBody(settingsNone, [provider], null);
  assert.deepEqual(body, { enabled: settings.enabled, frequency: settings.frequency, weekday: settings.weekday, timeOfDay: settings.timeOfDay, language: settings.language, modelSelection: { instanceId: "provider-a", model: "model-x" } });
  // No model at all: nothing to save, so Run now stays off.
  assert.equal(firstRunBody(settingsNone, [], null), null);
});

test("the next run reads today, tomorrow, a weekday, then a date", () => {
  const base = new Date(2026, 10, 7, 12, 0);
  assert.match(nextRunLabel(new Date(2026, 10, 7, 19, 0), base), /^today /);
  assert.match(nextRunLabel(new Date(2026, 10, 8, 7, 0), base), /^tomorrow /);
  assert.doesNotMatch(nextRunLabel(new Date(2026, 10, 10, 7, 0), base), /today|tomorrow/);
  assert.doesNotMatch(nextRunLabel(new Date(2026, 10, 20, 7, 0), base), /:/);
});
