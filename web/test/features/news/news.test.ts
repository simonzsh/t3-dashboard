import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProvider, NewsSettings, NewsTask } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { prune } from "../../../../shared/seen.ts";
import { formatMessageTime } from "../../../src/lib/format.ts";
import { isUnreadArticle, newsMark, readTarget, unreadNewsCount, dateLabel, formFromSettings, pickModel, shortDate, statusLine, toBody, topicsFromText, scheduleHint, WEEKDAYS } from "../../../src/features/news/news.ts";

const provider: DashboardProvider = { instanceId: "provider-a", displayName: "Provider A", models: [{ slug: "model-x", name: "Model X" }, { slug: "model-y", name: "Model Y" }] as never, runtimeModes: [] };
const settings: NewsSettings = { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", topics: ["Tech", "AI"], language: "French", modelSelection: { instanceId: "provider-a", model: "model-y" } };
const task = (over: Partial<NewsTask> = {}): NewsTask => ({ id: "t", enabled: true, nextRunAt: "2026-11-08T07:00:00.000Z", lastRunAt: null, lastRunStatus: null, lastRunError: null, ...over });
const now = new Date("2026-11-07T12:00:00.000Z");

test("topics split on lines only, trimmed, without empties or repeats", () => {
  assert.deepEqual(topicsFromText(" Tech \n\nAI, ML\r\nSoftware development\nAI, ML\nTECH "), ["Tech", "AI, ML", "Software development"]);
  assert.deepEqual(topicsFromText(" \n "), []);
});

test("the form shows the topics one per line", () => {
  const form = formFromSettings(settings, settings.modelSelection);
  assert.equal(form.topics, "Tech\nAI");
  assert.deepEqual([form.timeOfDay, form.language, form.selection], ["07:00", "French", settings.modelSelection]);
});

test("a valid form becomes the save body", () => {
  const form = { ...formFromSettings(settings, settings.modelSelection), topics: "Tech\nAI\ntech" };
  assert.deepEqual(toBody(form), { body: { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "07:00", topics: ["Tech", "AI"], language: "French", modelSelection: settings.modelSelection } });
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
  assert.equal(statusLine(task({ enabled: false }), now), "Automatic generation is off. Use Run now to get an article.");
});

test("an invalid form names the problem", () => {
  const ok = formFromSettings(settings, settings.modelSelection);
  const error = (over: object) => ("error" in toBody({ ...ok, ...over }) ? (toBody({ ...ok, ...over }) as { error: string }).error : null);
  assert.match(error({ timeOfDay: "" })!, /time/i);
  assert.match(error({ topics: " \n " })!, /topic/i);
  assert.match(error({ topics: Array.from({ length: 11 }, (_, i) => `t${i}`).join("\n") })!, /10 topics/);
  assert.match(error({ topics: "x".repeat(61) })!, /60/);
  assert.match(error({ language: "  " })!, /language/i);
  assert.match(error({ language: "x".repeat(41) })!, /40/);
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
  assert.match(statusLine(null, now), /Not scheduled/);
});

test("the status line gives the next run and the last run", () => {
  assert.equal(statusLine(task(), now), `Next article ${formatMessageTime("2026-11-08T07:00:00.000Z")}`);
  assert.equal(statusLine(task({ lastRunAt: "2026-11-07T09:00:00.000Z", lastRunStatus: "succeeded" }), now), `Next article ${formatMessageTime("2026-11-08T07:00:00.000Z")} · Last run 3 h ago`);
});

test("the status line says when the routine is paused or running, and shows a failure", () => {
  assert.match(statusLine(task({ lastRunStatus: "running", lastRunAt: "2026-11-07T11:59:00.000Z" }), now), /Running now/);
  assert.match(statusLine(task({ lastRunAt: "2026-11-07T09:00:00.000Z", lastRunStatus: "failed", lastRunError: "No model" }), now), /Last run failed: No model/);
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
