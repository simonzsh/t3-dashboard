import assert from "node:assert/strict";
import { test } from "bun:test";
import { NEWS_DEFAULTS } from "../../shared/news.ts";
import { isArticleDate, isArticleName, newsText, readNews } from "../../src/config/newsFile.ts";

const read = (value: unknown) => readNews("/cfg/news.json", () => (typeof value === "string" ? value : JSON.stringify(value)));
const empty = { settings: NEWS_DEFAULTS, taskId: null, taskCreatedAt: null };

test("a missing or broken file gives the defaults", () => {
  assert.deepEqual(readNews("/cfg/news.json", () => { throw new Error("ENOENT"); }), empty);
  assert.deepEqual(read("{nope"), empty);
  assert.deepEqual(read([1, 2]), empty);
});

test("saved news reads back unchanged", () => {
  const stored = { settings: { enabled: false, frequency: "weekly" as const, weekday: 0, timeOfDay: "06:30", language: "English", modelSelection: { instanceId: "claudeAgent", model: "m-1", options: [{ id: "effort", value: "low" }] } }, taskId: "scheduled-task:1", taskCreatedAt: "2026-11-01T08:00:00.000Z" };
  assert.deepEqual(read(newsText(stored)), stored);
});

test("each bad field falls back to its default and keeps the good ones", () => {
  const stored = read({ settings: { timeOfDay: "7am", language: "  ", modelSelection: { instanceId: "x" } }, taskId: 12, taskCreatedAt: "2026-11-01T08:00:00.000Z" });
  assert.deepEqual(stored, { settings: NEWS_DEFAULTS, taskId: null, taskCreatedAt: "2026-11-01T08:00:00.000Z" });
});

test("a file without the schedule fields reads as the defaults, field by field", () => {
  const old = read({ settings: { timeOfDay: "06:30", language: "English" }, taskId: "t" }).settings;
  assert.deepEqual([old.enabled, old.frequency, old.weekday, old.timeOfDay], [true, "daily", 1, "06:30"]);
  const bad = read({ settings: { enabled: "no", frequency: "monthly", weekday: 7 } }).settings;
  assert.deepEqual([bad.enabled, bad.frequency, bad.weekday], [true, "daily", 1]);
  assert.equal(read({ settings: { weekday: 1.5 } }).settings.weekday, 1);
  const good = read({ settings: { enabled: false, frequency: "weekly", weekday: 0 } }).settings;
  assert.deepEqual([good.enabled, good.frequency, good.weekday], [false, "weekly", 0]);
});

test("the file carries a version", () => {
  assert.equal(JSON.parse(newsText(empty)).version, 1);
});

test("an article name is a real date with the .md extension", () => {
  assert.equal(isArticleName("2026-11-07.md"), true);
  for (const name of ["2026-11-07.md.tmp", "2026-11-07.txt", "2026-02-31.md", "x2026-11-07.md", "../2026-11-07.md", "2026-11-07.md\n"]) assert.equal(isArticleName(name), false, name);
});

test("an article date refuses a day that does not exist", () => {
  assert.equal(isArticleDate("2024-02-29"), true);
  for (const date of ["2026-02-29", "2026-13-01", "2026-00-10", "2026-1-1", "../etc", "2026-11-07\n"]) assert.equal(isArticleDate(date), false, date);
});

test("an old file with topics still reads: the field is ignored and dropped on the next write", () => {
  const old = read({ settings: { enabled: true, frequency: "daily", weekday: 1, timeOfDay: "06:30", topics: ["Space", "Chips"], language: "English" }, taskId: "t" });
  assert.equal(old.settings.timeOfDay, "06:30");
  assert.ok(!("topics" in old.settings));
  assert.ok(!newsText(old).includes("topics"));
});
