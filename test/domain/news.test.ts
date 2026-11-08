import assert from "node:assert/strict";
import { test } from "bun:test";
import type { SaveNewsBody } from "../../shared/api.ts";
import { NEWS_DEFAULT_MODEL, NEWS_DEFAULTS } from "../../shared/news.ts";
import { readNews } from "../../src/config/newsFile.ts";
import { DomainError } from "../../src/domain/errors.ts";
import { articleTitle, createNews, newsPrompt } from "../../src/domain/news.ts";
import { IntegrationError } from "../../src/integrations/errors.ts";
import type { RawScheduledTask, RawThread } from "../../src/integrations/t3/schemas.ts";
import { FakePort } from "../helpers/fakePort.ts";

const FILE = "/cfg/news.json";
const DIR = "/cfg/news";
const NOW = new Date("2026-11-07T10:00:00.000Z");
const SELECTION = { instanceId: "claudeAgent", model: "model-x" };
const body = (extra: Partial<SaveNewsBody> = {}): SaveNewsBody => ({ enabled: true, frequency: "daily", weekday: 1, timeOfDay: "06:45", language: "English", modelSelection: SELECTION, ...extra });

interface Entry { name: string; mtimeMs: number; isFile: boolean }

function setup(options: { stored?: unknown; entries?: Entry[]; contents?: Record<string, string>; threads?: RawThread[] } = {}) {
  const port = new FakePort();
  const files: Record<string, string> = options.stored === undefined ? {} : { [FILE]: JSON.stringify(options.stored) };
  const folder = { entries: options.entries ?? [], contents: options.contents ?? {}, made: [] as string[], removed: [] as string[], reads: [] as Array<{ path: string; maxBytes?: number }>, listError: null as Error | null };
  const warnings: string[] = [];
  let counter = 0;
  const news = createNews({
    port,
    store: { rawThreads: () => options.threads ?? [] },
    file: FILE,
    dir: DIR,
    readFile: (path) => {
      if (path in files) return files[path]!;
      throw new Error("ENOENT");
    },
    writeSecret: (path, text) => void (files[path] = text),
    fs: {
      list: (dir) => {
        if (folder.listError) throw folder.listError;
        assert.equal(dir, DIR);
        return folder.entries;
      },
      read: (path, maxBytes) => {
        folder.reads.push({ path, maxBytes });
        const text = folder.contents[path];
        if (text === undefined) throw new Error("ENOENT");
        return text;
      },
      mkdir: (dir) => void folder.made.push(dir),
      remove: (path) => void folder.removed.push(path),
    },
    now: () => NOW,
    newId: () => `id-${++counter}`,
    warn: (message) => void warnings.push(message),
  });
  return { news, port, files, folder, warnings, stored: () => readNews(FILE, (path) => files[path]!) };
}

const liveTask = (extra: Partial<RawScheduledTask> = {}): RawScheduledTask => ({ id: "scheduled-task:old", title: "News", enabled: true, projectId: "project-9", runtimeMode: "approval-required", nextRunAt: "2026-11-08T06:45:00.000Z", ...extra });
const known = { settings: NEWS_DEFAULTS, taskId: "scheduled-task:old", taskCreatedAt: "2026-11-01T08:00:00.000Z" };

test("the prompt names the scope, the language, the folder and the date steps", () => {
  const prompt = newsPrompt({ ...NEWS_DEFAULTS, language: "English" }, "/data/news");
  for (const part of ["Run `date +%F`", "magazine for software developers", "security (vulnerabilities, breaches, incidents)", "at least 12 distinct stories", "`## Top stories`", "`## In brief`", "`## What to watch`", "Each story appears once", "Never mention these instructions", "never to a home page", "in English, like a professional news article", "/data/news/DATE.md.tmp", "rename it to /data/news/DATE.md", "do not ask questions", "No HTML, no images"]) assert.ok(prompt.includes(part), part);
});

test("the default model is Codex gpt-6-luna, and nothing is saved by default", () => {
  assert.deepEqual(NEWS_DEFAULT_MODEL, { instanceId: "codex", model: "gpt-6-luna" });
  assert.equal(NEWS_DEFAULTS.modelSelection, null);
});

test("an article title is its first heading, or its date", () => {
  assert.equal(articleTitle("# News of 2026-11-07\n\n## AI", "2026-11-07"), "News of 2026-11-07");
  assert.equal(articleTitle("Intro\n# Late title\n", "2026-11-07"), "Late title");
  assert.equal(articleTitle("## Only a section\n", "2026-11-07"), "2026-11-07");
  assert.equal(articleTitle("", "2026-11-07"), "2026-11-07");
});

test("the daily prompt covers 24 hours, the weekly prompt 7 days", () => {
  const daily = newsPrompt(NEWS_DEFAULTS, DIR);
  for (const part of ["last 24 hours", "widen to the last 72 hours", "most important story of the day", "headline about the most important story", "10-minute read", "wc -w"]) assert.ok(daily.includes(part), part);
  const weekly = newsPrompt({ ...NEWS_DEFAULTS, frequency: "weekly" }, DIR);
  for (const part of ["last 7 days", "widen to the last 10 days", "most important story of the week", "10-minute read"]) assert.ok(weekly.includes(part), part);
  for (const gone of ["24 hours", "72 hours"]) assert.ok(!weekly.includes(gone), gone);
  assert.equal(weekly.replaceAll("7 days", "24 hours").replaceAll("10 days", "72 hours").replaceAll("the week", "the day"), daily);
});

test("a weekly save schedules the chosen weekday, a daily save none", async () => {
  const weekly = setup();
  await weekly.news.save(body({ frequency: "weekly", weekday: 1 }));
  assert.deepEqual(weekly.port.createdTasks[0]!.schedule, { type: "fixed_time", timeOfDay: "06:45", weekdays: [1] });
  assert.equal(weekly.port.createdTasks[0]!.prompt, newsPrompt(body({ frequency: "weekly", weekday: 1 }), DIR));
  const sunday = setup({ stored: known });
  sunday.port.scheduledTasks = [liveTask()];
  await sunday.news.save(body({ frequency: "weekly", weekday: 0 }));
  assert.deepEqual(sunday.port.updatedTasks[0]!.schedule, { type: "fixed_time", timeOfDay: "06:45", weekdays: [0] });
  await sunday.news.save(body());
  assert.deepEqual(sunday.port.updatedTasks[1]!.schedule, { type: "fixed_time", timeOfDay: "06:45" });
});

test("a save with automatic generation off pauses the task, and a save with it on resumes it", async () => {
  const created = setup();
  await created.news.save(body({ enabled: false }));
  assert.equal(created.port.createdTasks[0]!.enabled, false);
  const { news, port, stored } = setup({ stored: known });
  port.scheduledTasks = [liveTask()];
  await news.save(body({ enabled: false }));
  assert.equal(port.updatedTasks[0]!.enabled, false);
  assert.equal(stored().settings.enabled, false);
  port.scheduledTasks = [liveTask({ enabled: false })];
  await news.save(body({ enabled: true }));
  assert.equal(port.updatedTasks[1]!.enabled, true);
  assert.equal(stored().settings.enabled, true);
});

test("get reports the real enabled flag of the task, and the saved one without a task", async () => {
  const { news, port } = setup({ stored: { ...known, settings: { ...NEWS_DEFAULTS, enabled: true } } });
  port.scheduledTasks = [liveTask({ enabled: false })];
  assert.equal((await news.get()).settings.enabled, false);
  port.scheduledTasks = [];
  assert.equal((await news.get()).settings.enabled, true);
});

test("run now works on a paused task", async () => {
  const { news, port } = setup({ stored: known });
  port.scheduledTasks = [liveTask({ enabled: false })];
  await news.runNow();
  assert.deepEqual(port.runNowCalls, ["scheduled-task:old"]);
});

test("the first save creates a daily routine, makes the folder and stores the task id", async () => {
  const { news, port, folder, stored } = setup();
  const state = await news.save(body());
  assert.equal(port.createdTasks.length, 1);
  const created = port.createdTasks[0]!;
  assert.deepEqual(
    { id: created.id, title: created.title, enabled: created.enabled, schedule: created.schedule, projectId: created.projectId, threadId: created.threadId, workspaceStrategy: created.workspaceStrategy, creationSource: created.creationSource, runtimeMode: created.runtimeMode, modelSelection: created.modelSelection },
    { id: "scheduled-task:id-1", title: "News", enabled: true, schedule: { type: "fixed_time", timeOfDay: "06:45" }, projectId: "scratch-project", threadId: null, workspaceStrategy: { type: "root" }, creationSource: "web", runtimeMode: "full-access", modelSelection: SELECTION },
  );
  assert.equal(created.prompt, newsPrompt(body(), DIR));
  assert.deepEqual(folder.made, [DIR]);
  assert.deepEqual(stored(), { settings: body(), taskId: "scheduled-task:id-1", taskCreatedAt: NOW.toISOString() });
  assert.deepEqual(state.settings, body());
  assert.equal(state.task, null);
});

test("a save updates the stored task and keeps its project", async () => {
  const { news, port, stored } = setup({ stored: known });
  port.scheduledTasks = [liveTask({ title: "Morning news" })];
  await news.save(body());
  assert.equal(port.createdTasks.length, 0);
  assert.deepEqual(port.updatedTasks, [{ id: "scheduled-task:old", title: "Morning news", prompt: newsPrompt(body(), DIR), enabled: true, schedule: { type: "fixed_time", timeOfDay: "06:45" }, projectId: "project-9", modelSelection: SELECTION, runtimeMode: "approval-required" }]);
  assert.deepEqual(stored(), { settings: body(), taskId: "scheduled-task:old", taskCreatedAt: known.taskCreatedAt });
});

test("a save recreates a task that was deleted in T3 and stores the new id", async () => {
  const { news, port, stored } = setup({ stored: known });
  port.scheduledTasks = [liveTask({ id: "scheduled-task:other" })];
  await news.save(body());
  assert.equal(port.updatedTasks.length, 0);
  assert.equal(port.createdTasks[0]!.id, "scheduled-task:id-1");
  assert.deepEqual([stored().taskId, stored().taskCreatedAt], ["scheduled-task:id-1", NOW.toISOString()]);
});

test("when T3 fails the settings stay saved and the error comes back", async () => {
  const { news, port, stored } = setup();
  port.createError = new Error("boom");
  await assert.rejects(news.save(body()), (error) => error instanceof IntegrationError && error.system === "t3");
  assert.deepEqual(stored(), { settings: body(), taskId: null, taskCreatedAt: null });
  port.scheduledTasksError = new IntegrationError("down", { system: "t3", kind: "unreachable" });
  await assert.rejects(news.save(body({ language: "French" })), IntegrationError);
  assert.equal(stored().settings.language, "French");
});

test("saves run one after the other: two quick saves create one task", async () => {
  const { news, port } = setup();
  const created = port.createScheduledTask.bind(port);
  port.createScheduledTask = async (task) => {
    await Promise.resolve();
    const result = await created(task);
    port.scheduledTasks.push(liveTask({ id: task.id }));
    return result;
  };
  await Promise.all([news.save(body()), news.save(body({ language: "French" }))]);
  assert.equal(port.createdTasks.length, 1);
  assert.equal(port.updatedTasks.length, 1);
  assert.match(port.updatedTasks[0]!.prompt, /in French/);
});

test("get returns the defaults, the live task and the articles newest first", async () => {
  const entries: Entry[] = [
    { name: "2026-11-05.md", mtimeMs: 1, isFile: true },
    { name: "2026-11-07.md", mtimeMs: 3, isFile: true },
    { name: "2026-11-07.md.tmp", mtimeMs: 4, isFile: true },
    { name: "2026-11-06.md", mtimeMs: 2, isFile: false },
    { name: "notes.md", mtimeMs: 2, isFile: true },
  ];
  const contents = { [`${DIR}/2026-11-05.md`]: "# Five", [`${DIR}/2026-11-07.md`]: "no heading" };
  const { news, port } = setup({ stored: known, entries, contents });
  port.scheduledTasks = [liveTask({ lastRunAt: "2026-11-07T06:45:00.000Z", lastRunStatus: "failed", lastRunError: "No web" })];
  const state = await news.get();
  assert.deepEqual(state.articles, [{ date: "2026-11-07", title: "2026-11-07", mtimeMs: 3 }, { date: "2026-11-05", title: "Five", mtimeMs: 1 }]);
  assert.deepEqual(state.task, { id: "scheduled-task:old", enabled: true, nextRunAt: "2026-11-08T06:45:00.000Z", lastRunAt: "2026-11-07T06:45:00.000Z", lastRunStatus: "failed", lastRunError: "No web" });
  assert.deepEqual(state.settings, NEWS_DEFAULTS);
});

test("get still lists the articles when T3 is down or the folder is missing", async () => {
  const { news, port, folder } = setup({ stored: known, entries: [{ name: "2026-11-07.md", mtimeMs: 1, isFile: true }], contents: { [`${DIR}/2026-11-07.md`]: "# A" } });
  port.scheduledTasksError = new Error("down");
  const state = await news.get();
  assert.equal(state.task, null);
  assert.equal(state.articles.length, 1);
  folder.listError = new Error("ENOENT");
  assert.deepEqual((await news.get()).articles, []);
});

test("an article is read by date, and a bad date or a missing file is refused", async () => {
  const { news } = setup({ entries: [{ name: "2026-11-07.md", mtimeMs: 1, isFile: true }, { name: "2026-11-06.md", mtimeMs: 1, isFile: false }], contents: { [`${DIR}/2026-11-07.md`]: "# Title\n\nText", [`${DIR}/2026-11-06.md`]: "# Link" } });
  assert.deepEqual(await news.article("2026-11-07"), { date: "2026-11-07", title: "Title", markdown: "# Title\n\nText" });
  for (const date of ["../x", "2026-02-31", "2026-11-07.md"]) await assert.rejects(news.article(date), (error) => error instanceof DomainError && error.code === "invalid");
  for (const date of ["2026-11-01", "2026-11-06"]) await assert.rejects(news.article(date), (error) => error instanceof DomainError && error.code === "not-found");
});

test("search finds a title or a body, ignores case and accents, and lists the newest first", async () => {
  const entries = ["2026-11-05", "2026-11-07", "2026-11-06", "2026-11-04"].map((d) => ({ name: `${d}.md`, mtimeMs: 1, isFile: true }));
  const contents = {
    [`${DIR}/2026-11-07.md`]: "# Café ouvert\n\nRien.",
    [`${DIR}/2026-11-06.md`]: "# Autre\n\nUn CAFE chaud.",
    [`${DIR}/2026-11-05.md`]: "# Autre\n\nRien.",
  };
  const { news } = setup({ entries, contents });
  assert.deepEqual(await news.search("cafe"), { dates: ["2026-11-07", "2026-11-06"] });
  assert.deepEqual(await news.search("  CAFÉ "), { dates: ["2026-11-07", "2026-11-06"] });
  assert.deepEqual(await news.search("ouvert"), { dates: ["2026-11-07"] });
  assert.deepEqual(await news.search("zzz"), { dates: [] });
});

test("search refuses an empty or too long query", async () => {
  const { news } = setup();
  for (const q of ["", "   ", "x".repeat(101)]) await assert.rejects(news.search(q), (error) => error instanceof DomainError && error.code === "invalid");
  await news.search("x".repeat(100));
});

test("a huge article is cut at 512 KB", async () => {
  const { news } = setup({ entries: [{ name: "2026-11-07.md", mtimeMs: 1, isFile: true }], contents: { [`${DIR}/2026-11-07.md`]: `# Big\n${"x".repeat(600_000)}` } });
  assert.equal((await news.article("2026-11-07")).markdown.length, 512 * 1024);
});

test("run now starts the stored task, and asks for a save when there is none", async () => {
  const first = setup();
  await assert.rejects(first.news.runNow(), (error) => error instanceof DomainError && error.code === "not-found" && error.message === "Save the News settings first");
  const second = setup({ stored: known });
  await assert.rejects(second.news.runNow(), DomainError);
  second.port.scheduledTasks = [liveTask()];
  await second.news.runNow();
  assert.deepEqual(second.port.runNowCalls, ["scheduled-task:old"]);
  assert.equal(second.port.createdTasks.length, 0);
});

// A finished run thread of the news task, with its first user message read by the sweep.
const run = (id: string, extra: Partial<RawThread> = {}): RawThread => ({ id, projectId: "project-9", title: "News", status: "completed", createdAt: "2026-11-07T06:45:00.000Z", latestRunCompletedAt: "2026-11-07T06:55:00.000Z", ...extra });
const owned = (port: FakePort, id: string, taskId = "scheduled-task:old") => void (port.projections[id] = { messages: [{ id: `${id}-m`, role: "user", text: "p", scheduledTaskId: taskId }] });
const FRESH: Entry[] = [{ name: "2026-11-07.md", mtimeMs: Date.parse("2026-11-07T06:50:00.000Z"), isFile: true }];

test("the sweep archives a finished run of the news task that wrote an article", async () => {
  const { news, port } = setup({ stored: known, entries: FRESH, threads: [run("t-1")] });
  port.scheduledTasks = [liveTask()];
  owned(port, "t-1");
  await news.sweep();
  assert.deepEqual(port.commands, [{ type: "thread.archive", threadId: "t-1", commandId: "id-1" }]);
  await news.sweep();
  assert.equal(port.commands.length, 1);
  assert.equal(port.projectionCalls, 1);
});

test("the sweep leaves alone what is not a finished news run with a fresh article", async () => {
  const threads = [
    run("other-task"),
    run("failed", { status: "failed", lastError: "x" }),
    run("running", { status: "running", activeRunId: "r" }),
    run("already", { archivedAt: "2026-11-07T07:00:00.000Z" }),
    run("before-task", { createdAt: "2026-10-01T06:45:00.000Z" }),
    run("no-article", { createdAt: "2026-11-07T08:00:00.000Z" }),
    run("no-message"),
  ];
  const { news, port } = setup({ stored: known, entries: FRESH, threads });
  port.scheduledTasks = [liveTask()];
  for (const id of ["failed", "running", "already", "before-task", "no-article"]) owned(port, id);
  owned(port, "other-task", "scheduled-task:else");
  port.projections["no-message"] = { messages: [] };
  await news.sweep();
  assert.deepEqual(port.commands, []);
});

test("the sweep does nothing before the first save, and survives T3 errors", async () => {
  const none = setup({ entries: FRESH, threads: [run("t-1")] });
  await none.news.sweep();
  assert.equal(none.port.projectionCalls, 0);
  const broken = setup({ stored: known, entries: FRESH, threads: [run("t-1"), run("t-2")] });
  broken.port.scheduledTasks = [liveTask()];
  broken.port.scheduledTasks = [liveTask()];
  owned(broken.port, "t-2");
  broken.port.projectionFailures.add("t-1");
  await broken.news.sweep();
  assert.deepEqual(broken.port.commands.map((c) => c.threadId), ["t-2"]);
  const failing = setup({ stored: known, entries: FRESH, threads: [run("t-3")] });
  failing.port.scheduledTasks = [liveTask()];
  failing.port.scheduledTasks = [liveTask()];
  owned(failing.port, "t-3");
  failing.port.dispatchError = new Error("no");
  await failing.news.sweep();
  assert.equal(failing.warnings.length, 1);
  await failing.news.sweep();
  assert.equal(failing.warnings.length, 1);
});

test("the sweep reads at most 10 new threads at a time", async () => {
  const threads = Array.from({ length: 14 }, (_, index) => run(`t-${index}`));
  const { news, port } = setup({ stored: known, entries: FRESH, threads });
  port.scheduledTasks = [liveTask()];
  for (const thread of threads) owned(port, thread.id);
  await news.sweep();
  assert.equal(port.projectionCalls, 10);
  await news.sweep();
  assert.equal(port.commands.length, 14);
});

test("the sweep reads a thread again later when T3 had no first message yet", async () => {
  const { news, port } = setup({ stored: known, entries: FRESH, threads: [run("t-1")] });
  port.scheduledTasks = [liveTask()];
  port.projections["t-1"] = { messages: [] };
  await news.sweep();
  owned(port, "t-1");
  await news.sweep();
  assert.equal(port.commands.length, 1);
});

test("an empty run is not archived because a later run wrote an article", async () => {
  const late: Entry[] = [{ name: "2026-11-07.md", mtimeMs: Date.parse("2026-11-07T09:00:00.000Z"), isFile: true }];
  const { news, port } = setup({ stored: known, entries: late, threads: [run("empty")] });
  port.scheduledTasks = [liveTask()];
  owned(port, "empty");
  await news.sweep();
  assert.deepEqual(port.commands, []);
});

test("the sweep never reads a thread of another project and reads the newest first", async () => {
  const threads = [
    run("foreign", { projectId: "project-other" }),
    ...Array.from({ length: 12 }, (_, index) => run(`t-${index}`, { createdAt: `2026-11-07T06:${String(10 + index).padStart(2, "0")}:00.000Z` })),
  ];
  const { news, port } = setup({ stored: known, entries: FRESH, threads });
  port.scheduledTasks = [liveTask()];
  const read: string[] = [];
  const projection = port.threadProjection.bind(port);
  port.threadProjection = async (id: string) => (read.push(id), projection(id as string));
  for (const thread of threads) owned(port, thread.id);
  await news.sweep();
  assert.ok(!read.includes("foreign"));
  assert.deepEqual(read, Array.from({ length: 10 }, (_, index) => `t-${11 - index}`));
});

test("get returns the mtime and reads a file only once while it does not change", async () => {
  const { news, folder } = setup({ entries: [{ name: "2026-11-07.md", mtimeMs: 42, isFile: true }], contents: { [`${DIR}/2026-11-07.md`]: "# A" } });
  assert.equal((await news.get()).articles[0]!.mtimeMs, 42);
  await news.get();
  await news.search("a");
  assert.deepEqual(folder.reads, [{ path: `${DIR}/2026-11-07.md`, maxBytes: undefined }]);
});

const live = (id: string, extra: Partial<RawThread> = {}) => run(id, { status: "running", activeRunId: "r", latestRunCompletedAt: undefined, ...extra });

test("get reports the running thread of the news task", async () => {
  const { news, port } = setup({ stored: known, threads: [live("t-1")] });
  port.scheduledTasks = [liveTask()];
  owned(port, "t-1");
  assert.deepEqual((await news.get()).running, { threadId: "t-1", startedAt: "2026-11-07T06:45:00.000Z" });
  await news.get();
  assert.equal(port.projectionCalls, 1);
});

test("get reports no run for a done thread, another task or another project", async () => {
  const { news, port } = setup({ stored: known, threads: [run("done"), live("other"), live("elsewhere", { projectId: "project-1" }), live("old", { createdAt: "2026-10-01T06:45:00.000Z" })] });
  port.scheduledTasks = [liveTask()];
  owned(port, "done");
  owned(port, "other", "scheduled-task:else");
  owned(port, "elsewhere");
  owned(port, "old");
  assert.equal((await news.get()).running, null);
});

test("get falls back to the task status when no thread is found", async () => {
  const { news, port } = setup({ stored: known });
  port.scheduledTasks = [liveTask({ lastRunStatus: "running", lastRunAt: "2026-11-07T06:45:00.000Z" })];
  assert.deepEqual((await news.get()).running, { threadId: null, startedAt: "2026-11-07T06:45:00.000Z" });
  port.scheduledTasks = [liveTask({ lastRunStatus: "succeeded" })];
  assert.equal((await news.get()).running, null);
});

const file = (name: string, isFile = true): Entry => ({ name, mtimeMs: 1, isFile });

test("remove deletes only the file of a valid date", async () => {
  const { news, folder } = setup({ entries: [file("2026-11-07.md"), file("2026-11-06.md")] });
  await news.remove("2026-11-07");
  assert.deepEqual(folder.removed, [`${DIR}/2026-11-07.md`]);
});

test("remove refuses a bad date and a missing article, and deletes nothing", async () => {
  const { news, folder } = setup({ entries: [file("2026-11-07.md")] });
  await assert.rejects(news.remove("../secret"), (e: unknown) => e instanceof DomainError && e.code === "invalid");
  await assert.rejects(news.remove("2026-02-31"), (e: unknown) => e instanceof DomainError && e.code === "invalid");
  await assert.rejects(news.remove("2026-11-01"), (e: unknown) => e instanceof DomainError && e.code === "not-found");
  assert.deepEqual(folder.removed, []);
});

test("remove leaves a symlink or a folder of that name alone", async () => {
  const { news, folder } = setup({ entries: [file("2026-11-07.md", false)] });
  await assert.rejects(news.remove("2026-11-07"), (e: unknown) => e instanceof DomainError && e.code === "not-found");
  assert.deepEqual(folder.removed, []);
});

test("removeAll deletes every article file, counts them, and leaves the rest", async () => {
  const { news, folder } = setup({ entries: [file("2026-11-07.md"), file("2026-11-06.md"), file("2026-11-08.md.tmp"), file("notes.md"), file("2026-11-05.md", false)] });
  assert.equal(await news.removeAll(), 2);
  assert.deepEqual(folder.removed, [`${DIR}/2026-11-07.md`, `${DIR}/2026-11-06.md`]);
});

test("removeAll gives 0 when the folder is empty or missing", async () => {
  const { news, folder } = setup();
  assert.equal(await news.removeAll(), 0);
  folder.listError = new Error("ENOENT");
  assert.equal(await news.removeAll(), 0);
});
