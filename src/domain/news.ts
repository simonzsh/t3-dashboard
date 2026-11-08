import type { NewsArticle, NewsRunning, NewsArticleSummary, NewsSettings, NewsState, NewsTask, SaveNewsBody } from "../../shared/news.ts";
import { isRuntimeMode } from "../../shared/limits.ts";
import { threadState } from "../../shared/status.ts";
import { isArticleDate, isArticleName, newsText, readNews, type StoredNews } from "../config/newsFile.ts";
import type { ReadFile } from "../config/config.ts";
import { archiveThreadCommand } from "../integrations/t3/commands.ts";
import type { RawScheduledTask, T3Port } from "../integrations/t3/schemas.ts";
import { lastRunOf, viaT3 } from "./automations.ts";
import { routineSchedule } from "./automationSchedule.ts";
import { isHidden, toDashboardThread } from "./classify.ts";
import { DomainError } from "./errors.ts";
import { readScheduledTaskId } from "./threadOwner.ts";
import type { ShellStore } from "./shellStore.ts";

const TASK_TITLE = "News";
const ARTICLE_MAX_CHARS = 512 * 1024;
const SWEEP_READS = 10;
const TITLE_BYTES = 4096;
// The file lands shortly before or after T3 stamps the end of the run.
const RUN_MARGIN_MS = 2 * 60_000;

export function newsPrompt(settings: NewsSettings, dir: string): string {
  const weekly = settings.frequency === "weekly";
  return `Write today's news article. Nobody reads this thread: do not ask questions.

1. Run \`date +%F\` to get today's date in this machine's time zone. Call it DATE.
2. Search the web for the most important news of the last ${weekly ? "7 days" : "24 hours"} for a software developer who follows: AI (models, research, products), software development (languages, frameworks, tools), security (vulnerabilities, breaches, incidents), the tech industry (major announcements, companies, regulation), and open source. Prefer primary sources and skip anything older than ${weekly ? "8 days" : "48 hours"}. Rank stories by importance, not by category.
3. Write the article in Markdown, in ${settings.language}:
   - first line: \`# \` and a headline about the main subject of the article, like a newspaper front page (at most 80 characters, no date, not the word "News");
   - an intro paragraph of 3 or 4 sentences on what matters most;
   - \`## Top stories\`: the 3 to 5 most important stories, each a \`### \` headline, then 2 or 3 paragraphs: what happened, the context, and why it matters to a developer, with a source link [name](https://...);
   - then up to 5 \`## \` sections named after the areas that had real news that ${weekly ? "week" : "day"} (skip an area with nothing worth reading), ${weekly ? "4 to 8" : "3 to 6"} items each: a bold headline and one paragraph of 3 to 5 sentences with a source link;
   - end with \`## Key takeaways\`: 3 to 5 bullet points.
   The article is a 10-minute read: 2,000 to 2,500 words. Every fact must come from a source you read; do not pad. No HTML, no images.
4. Save it: create the folder ${dir} if missing and write the file ${dir}/DATE.md.tmp. Run \`wc -w\` on it: under 2,000 words, search for more stories and context, rewrite the file, and check again. Then rename it to ${dir}/DATE.md (replace an older file of that name). Write nothing anywhere else.
5. Reply with one line: the path of the file.`;
}

/** The first top-level heading, or the date when the agent wrote none. */
export function articleTitle(markdown: string, date: string): string {
  const heading = markdown.split("\n").find((line) => line.startsWith("# "));
  return heading?.slice(2).trim() || date;
}

const SEARCH_MAX_CHARS = 100;
/** Lowercase without accents, so "Cafe" finds "Café". */
const fold = (text: string): string => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

export interface NewsFolder {
  list(dir: string): Array<{ name: string; mtimeMs: number; isFile: boolean }>;
  /** `maxBytes` limits the read to the start of the file. */
  read(path: string, maxBytes?: number): string;
  mkdir(dir: string): void;
  /** Deletes one file; a symlink is removed itself, never followed. */
  remove(path: string): void;
}

export interface NewsOptions {
  port: Pick<T3Port, "listScheduledTasks" | "createScheduledTask" | "updateScheduledTask" | "runScheduledTaskNow" | "ensureScratchProject" | "threadProjection" | "dispatch">;
  store: Pick<ShellStore, "rawThreads">;
  /** The settings file, and the folder where the agent writes the articles. */
  file: string;
  dir: string;
  readFile: ReadFile;
  writeSecret: (file: string, text: string) => void;
  fs: NewsFolder;
  now?: () => Date;
  newId?: () => string;
  warn?: (message: string) => void;
}

export interface News {
  get(): Promise<NewsState>;
  article(date: string): Promise<NewsArticle>;
  /** The dates of the articles whose title or text contains `query`, newest first. Case and accents are ignored. */
  search(query: string): Promise<{ dates: string[] }>;
  /** Stores the settings, then creates or updates the T3 routine. */
  save(body: SaveNewsBody): Promise<NewsState>;
  runNow(): Promise<void>;
  /** Deletes one article file. */
  remove(date: string): Promise<void>;
  /** Deletes every article file and returns how many. Other files stay. */
  removeAll(): Promise<number>;
  /** Archives the finished run threads that wrote an article. */
  sweep(): Promise<void>;
}

const toTask = (task: RawScheduledTask): NewsTask => ({
  id: task.id,
  enabled: task.enabled !== false,
  nextRunAt: task.nextRunAt ?? null,
  ...lastRunOf(task),
});

export function createNews(options: NewsOptions): News {
  const { port, store, file, dir, fs } = options;
  const now = options.now ?? (() => new Date());
  const newId = options.newId ?? (() => crypto.randomUUID());
  const warn = options.warn ?? console.warn;
  const load = () => readNews(file, options.readFile);
  const write = (stored: StoredNews) => options.writeSecret(file, newsText(stored));
  // Thread id -> task id read from its first message; read once per process.
  const owners = new Map<string, string | null>();
  const archived = new Set<string>();
  let sweeping = false;
  let queue: Promise<unknown> = Promise.resolve();

  const files = () => {
    try {
      return fs.list(dir).filter((entry) => entry.isFile && isArticleName(entry.name));
    } catch {
      return [];
    }
  };

  async function liveTask(stored: StoredNews): Promise<RawScheduledTask | undefined> {
    if (!stored.taskId) return undefined;
    return (await viaT3(port.listScheduledTasks())).find((task) => task.id === stored.taskId);
  }

  // Run threads of the news task, newest first. The probe result is shared with the sweep.
  async function runningRun(stored: StoredNews, live: RawScheduledTask): Promise<NewsRunning | null> {
    const since = Date.parse(stored.taskCreatedAt ?? "");
    if (!stored.taskId || Number.isNaN(since)) return null;
    const at = now();
    const active = store
      .rawThreads()
      .filter(
        (thread) =>
          thread.projectId === live.projectId &&
          thread.creationSource === live.creationSource &&
          !isHidden(thread) &&
          !archived.has(thread.id) &&
          Date.parse(thread.createdAt ?? "") >= since &&
          ["running", "waiting"].includes(threadState(toDashboardThread(thread, at))),
      )
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
      .slice(0, SWEEP_READS);
    for (const thread of active) {
      if (!owners.has(thread.id)) {
        const owner = await readScheduledTaskId(port, thread.id);
        if (owner !== undefined) owners.set(thread.id, owner);
      }
      if (owners.get(thread.id) === stored.taskId) return { threadId: thread.id, startedAt: thread.createdAt ?? null };
    }
    return null;
  }

  async function get(): Promise<NewsState> {
    const stored = load();
    let task: NewsTask | null = null;
    let running: NewsRunning | null = null;
    try {
      const live = await liveTask(stored);
      task = live ? toTask(live) : null;
      if (live) {
        running = await runningRun(stored, live);
        if (!running && task?.lastRunStatus === "running") running = { threadId: null, startedAt: task.lastRunAt };
      }
    } catch {
      // T3 does not answer: the articles are still on disk.
    }
    const articles = files()
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((entry): NewsArticleSummary => {
        const date = entry.name.slice(0, 10);
        let markdown = "";
        try {
          // Only the head: the title is the first heading.
          markdown = fs.read(`${dir}/${date}.md`, TITLE_BYTES);
        } catch {
          // An unreadable file keeps its date as title.
        }
        return { date, title: articleTitle(markdown, date), mtimeMs: entry.mtimeMs };
      });
    // The routine can be paused or resumed in Automations: the real state wins.
    return { settings: { ...stored.settings, enabled: task?.enabled ?? stored.settings.enabled }, task, articles, running };
  }

  async function persist(body: SaveNewsBody): Promise<NewsState> {
    const settings: NewsSettings = { enabled: body.enabled, frequency: body.frequency, weekday: body.weekday, timeOfDay: body.timeOfDay, language: body.language, modelSelection: body.modelSelection };
    const stored = { ...load(), settings };
    write(stored);
    fs.mkdir(dir);
    const live = await liveTask(stored);
    const prompt = newsPrompt(settings, dir);
    const schedule = routineSchedule({ type: "fixed_time", timeOfDay: settings.timeOfDay, weekdays: settings.frequency === "weekly" ? [settings.weekday] : [] });
    if (live) {
      await viaT3(
        port.updateScheduledTask(live.id, {
          // Keep a title the user renamed in T3.
          title: live.title || TASK_TITLE,
          prompt,
          enabled: settings.enabled,
          schedule,
          projectId: live.projectId || (await viaT3(port.ensureScratchProject())),
          modelSelection: body.modelSelection,
          runtimeMode: isRuntimeMode(live.runtimeMode) ? live.runtimeMode : "full-access",
        }),
      );
    } else {
      const created = await viaT3(
        port.createScheduledTask({
          id: `scheduled-task:${newId()}`,
          title: TASK_TITLE,
          prompt,
          enabled: settings.enabled,
          schedule,
          projectId: await viaT3(port.ensureScratchProject()),
          threadId: null,
          workspaceStrategy: { type: "root" },
          modelSelection: body.modelSelection,
          runtimeMode: "full-access",
          interactionMode: "default",
          creationSource: "web",
        }),
      );
      write({ ...stored, taskId: created.id, taskCreatedAt: now().toISOString() });
    }
    return get();
  }

  async function sweepOnce(): Promise<void> {
    const stored = load();
    const since = Date.parse(stored.taskCreatedAt ?? "");
    if (!stored.taskId || Number.isNaN(since)) return;
    const task = await liveTask(stored);
    if (!task) return;
    const at = now();
    const finished = store
      .rawThreads()
      .filter(
        (thread) =>
          thread.projectId === task.projectId &&
          thread.creationSource === task.creationSource &&
          !isHidden(thread) &&
          !archived.has(thread.id) &&
          Date.parse(thread.createdAt ?? "") >= since &&
          threadState(toDashboardThread(thread, at)) === "done",
      )
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
    for (const thread of finished.filter((entry) => !owners.has(entry.id)).slice(0, SWEEP_READS)) {
      // Undefined: not readable yet, so the thread is read again later.
      const owner = await readScheduledTaskId(port, thread.id);
      if (owner !== undefined) owners.set(thread.id, owner);
    }
    // An article only counts when it was written during the run of this thread: a failed run must not be archived because a later run wrote one.
    const written = files().map((entry) => entry.mtimeMs);
    for (const thread of finished) {
      if (owners.get(thread.id) !== stored.taskId) continue;
      const from = Date.parse(thread.createdAt ?? "");
      const to = Date.parse(thread.latestRunCompletedAt ?? thread.updatedAt ?? "") + RUN_MARGIN_MS;
      if (Number.isNaN(to) || !written.some((mtime) => mtime >= from && mtime <= to)) continue;
      archived.add(thread.id);
      try {
        await port.dispatch({ ...archiveThreadCommand(thread.id), commandId: newId() });
      } catch (error) {
        warn(`Could not archive news thread ${thread.id}: ${(error as Error).message}`);
      }
    }
  }

  return {
    get,

    async article(date) {
      if (!isArticleDate(date)) throw new DomainError("invalid", "The date must look like 2026-11-07");
      // Listed first: a symlink or a folder with this name is not an article.
      if (!files().some((entry) => entry.name === `${date}.md`)) throw new DomainError("not-found", "No article for this date");
      let markdown: string;
      try {
        markdown = fs.read(`${dir}/${date}.md`).slice(0, ARTICLE_MAX_CHARS);
      } catch {
        throw new DomainError("not-found", "No article for this date");
      }
      return { date, title: articleTitle(markdown, date), markdown };
    },

    async search(query) {
      const needle = fold(query.trim());
      if (needle.length < 1 || needle.length > SEARCH_MAX_CHARS) throw new DomainError("invalid", `The search must have 1 to ${SEARCH_MAX_CHARS} characters`);
      const dates: string[] = [];
      for (const entry of files().sort((a, b) => b.name.localeCompare(a.name))) {
        const date = entry.name.slice(0, 10);
        try {
          const markdown = fs.read(`${dir}/${entry.name}`).slice(0, ARTICLE_MAX_CHARS);
          if (fold(`${articleTitle(markdown, date)}\n${markdown}`).includes(needle)) dates.push(date);
        } catch {
          // An unreadable file does not match.
        }
      }
      return { dates };
    },

    async remove(date) {
      if (!isArticleDate(date)) throw new DomainError("invalid", "The date must look like 2026-11-07");
      // Listed first: only a regular file of this name is deleted.
      if (!files().some((entry) => entry.name === `${date}.md`)) throw new DomainError("not-found", "No article for this date");
      try {
        fs.remove(`${dir}/${date}.md`);
      } catch {
        throw new DomainError("not-found", "No article for this date");
      }
    },

    async removeAll() {
      let removed = 0;
      for (const entry of files()) {
        try {
          fs.remove(`${dir}/${entry.name}`);
          removed++;
        } catch (error) {
          warn(`Could not delete article ${entry.name}: ${(error as Error).message}`);
        }
      }
      return removed;
    },

    save(body) {
      const run = queue.then(() => persist(body));
      queue = run.catch(() => {});
      return run;
    },

    async runNow() {
      const live = await liveTask(load());
      if (!live) throw new DomainError("not-found", "Save the News settings first");
      await viaT3(port.runScheduledTaskNow(live.id));
    },

    async sweep() {
      if (sweeping) return;
      sweeping = true;
      try {
        await sweepOnce();
      } catch (error) {
        warn(`News sweep failed: ${(error as Error).message}`);
      } finally {
        sweeping = false;
      }
    },
  };
}
