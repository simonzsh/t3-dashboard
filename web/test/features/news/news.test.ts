import { test } from "bun:test";
import assert from "node:assert/strict";
import type { DashboardProvider, NewsSettings, NewsTask } from "../../../../shared/api.ts";
import { formatMessageTime } from "../../../src/lib/format.ts";
import { dateLabel, formFromSettings, pickModel, shortDate, statusLine, toBody, topicsFromText } from "../../../src/features/news/news.ts";

const provider: DashboardProvider = { instanceId: "provider-a", displayName: "Provider A", models: [{ slug: "model-x", name: "Model X" }, { slug: "model-y", name: "Model Y" }] as never, runtimeModes: [] };
const settings: NewsSettings = { timeOfDay: "07:00", topics: ["Tech", "AI"], language: "French", modelSelection: { instanceId: "provider-a", model: "model-y" } };
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
  assert.deepEqual(toBody(form), { body: { timeOfDay: "07:00", topics: ["Tech", "AI"], language: "French", modelSelection: settings.modelSelection } });
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
  assert.match(statusLine(task({ enabled: false }), now), /Paused.*Automations/);
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
