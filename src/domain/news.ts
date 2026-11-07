import type { NewsArticle, NewsArticleSummary, NewsSettings, NewsState, NewsTask, SaveNewsBody } from "../../shared/news.ts";
import type { AutomationRunStatus } from "../../shared/automations.ts";
import { isRuntimeMode } from "../../shared/limits.ts";
import { threadState } from "../../shared/status.ts";
import { isArticleDate, isArticleName, newsText, readNews, type StoredNews } from "../config/newsFile.ts";
import type { ReadFile } from "../config/config.ts";
import { IntegrationError } from "../integrations/errors.ts";
import { archiveThreadCommand } from "../integrations/t3/commands.ts";
import type { RawScheduledTask, T3Port } from "../integrations/t3/schemas.ts";
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
const RUN_STATUSES = new Set<string>(["running", "succeeded", "failed"] satisfies AutomationRunStatus[]);

export function newsPrompt(settings: NewsSettings, dir: string): string {
  const weekly = settings.frequency === "weekly";
  return `Write today's news article. Nobody reads this thread: do not ask questions.

1. Run \`date +%F\` to get today's date in this machine's time zone. Call it DATE.
2. Search the web for the most important news of the last ${weekly ? "7 days" : "24 hours"} on these topics: ${settings.topics.join("; ")}. Prefer primary sources and skip anything older than ${weekly ? "8 days" : "48 hours"}.
3. Write the article in Markdown, in ${settings.language}:
   - first line: \`# \` followed by a short title that contains DATE;
   - one \`## \` section per topic, 3 to ${weekly ? 8 : 6} items each: a bold headline, two or three sentences, and a source link [name](https://...);
   - end with a \`## \` section of 3 key takeaways.
   No HTML, no images.
4. Save it: create the folder ${dir} if missing, write the file ${dir}/DATE.md.tmp, then rename it to ${dir}/DATE.md (replace an older file of that name). Write nothing anywhere else.
5. Reply with one line: the path of the file.`;
}

/** The first top-level heading, or the date when the agent wrote none. */
export function articleTitle(markdown: string, date: string): string {
  const heading = markdown.split("\n").find((line) => line.startsWith("# "));
  return heading?.slice(2).trim() || date;
}

export interface NewsFolder {
  list(dir: string): Array<{ name: string; mtimeMs: number; isFile: boolean }>;
  /** `maxBytes` limits the read to the start of the file. */
  read(path: string, maxBytes?: number): string;
  mkdir(dir: string): void;
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
  /** Stores the settings, then creates or updates the T3 routine. */
  save(body: SaveNewsBody): Promise<NewsState>;
  runNow(): Promise<void>;
  /** Archives the finished run threads that wrote an article. */
  sweep(): Promise<void>;
}

async function viaT3<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError((error as Error).message, { system: "t3", kind: "unreachable" });
  }
}

const toTask = (task: RawScheduledTask): NewsTask => ({
  id: task.id,
  enabled: task.enabled !== false,
  nextRunAt: task.nextRunAt ?? null,
  lastRunAt: task.lastRunAt ?? null,
  lastRunStatus: task.lastRunStatus && RUN_STATUSES.has(task.lastRunStatus) ? (task.lastRunStatus as AutomationRunStatus) : null,
  lastRunError: task.lastRunError ?? null,
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

  async function get(): Promise<NewsState> {
    const stored = load();
    let task: NewsTask | null = null;
    try {
      const live = await liveTask(stored);
      task = live ? toTask(live) : null;
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
    return { settings: { ...stored.settings, enabled: task?.enabled ?? stored.settings.enabled }, task, articles };
  }

  async function persist(body: SaveNewsBody): Promise<NewsState> {
    const settings: NewsSettings = { enabled: body.enabled, frequency: body.frequency, weekday: body.weekday, timeOfDay: body.timeOfDay, topics: body.topics, language: body.language, modelSelection: body.modelSelection };
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
