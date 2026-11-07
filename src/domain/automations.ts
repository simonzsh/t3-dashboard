import type { Automation, AutomationRunStatus, AutomationsResult, CreateAutomationBody, CreateAutomationResult, UpdateAutomationBody, WebhookSignature } from "../../shared/api.ts";
import { isRuntimeMode } from "../../shared/limits.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { RawScheduledTask, RawThread, ScheduleChange, ScheduleInput, T3Port } from "../integrations/t3/schemas.ts";
import { archiveThreadCommand, renameThreadCommand } from "../integrations/t3/commands.ts";
import { reminderSchedule, routineOf, routineSchedule, webhookFilters, webhookSchedule } from "./automationSchedule.ts";
import { AutomationRunLog, recordRuns, runThreads, threadOwners, type RunLog, type ThreadLinks } from "./automationRuns.ts";
import { isHidden } from "./classify.ts";
import { DomainError } from "./errors.ts";
import { RearmedStore } from "./rearmedStore.ts";
import { scheduleLabel } from "./scheduleLabel.ts";
import type { ShellStore } from "./shellStore.ts";

const REMINDER_PREFIX = /^\s*(?:reminder|rappel)\s*:\s*/i;

// Older reminders paused themselves from their prompt: this marks them. A new reminder has the prefix.
const pauseInstruction = (id: string) => `call schedule_task with scheduledTaskId ${id} and enabled: false`;
const pausesItself = (task: RawScheduledTask) => (task.prompt ?? "").includes(pauseInstruction(task.id));
const isWebhook = (task: RawScheduledTask) => task.schedule?.type === "webhook";
export const isReminder = (task: RawScheduledTask) => !isWebhook(task) && (pausesItself(task) || REMINDER_PREFIX.test(task.title ?? ""));
const kindOf = (task: RawScheduledTask): Automation["kind"] => (isWebhook(task) ? "webhook" : isReminder(task) ? "reminder" : "routine");
const displayTitle = (task: RawScheduledTask) => (isReminder(task) ? (task.title ?? "").replace(REMINDER_PREFIX, "") : (task.title ?? ""));

function signatureOf(task: RawScheduledTask): WebhookSignature | null {
  const signature = task.schedule?.signature;
  if (!signature || typeof signature.header !== "string" || (signature.encoding !== "hex" && signature.encoding !== "base64")) return null;
  return { header: signature.header, encoding: signature.encoding, prefix: signature.prefix ?? "" };
}
const TITLE_MAX = 60;
const PROBES_PER_LIST = 30;
const PROBE_CONCURRENCY = 4;
const RUN_STATUSES = new Set<string>(["running", "succeeded", "failed"] satisfies AutomationRunStatus[]);

/** The tasks of T3 as rows, plus the threads that belong to a task. */
export function toAutomations(tasks: RawScheduledTask[], threads: RawThread[], dedicated: ReadonlySet<string>, projectTitle: (id: string) => string | null, runs: RunLog = {}, links: ThreadLinks = new Map()): AutomationsResult {
  const owners = threadOwners(tasks, runs, links);
  const marked = new Set<string>();
  const bound = new Set<string>();
  const automations = tasks.map((task): Automation => {
    let threadId = task.threadId ?? null;
    if (threadId !== null) bound.add(threadId);
    if (threadId === null) {
      const matched = runThreads(task, threads, owners);
      for (const run of matched) marked.add(run.id);
      threadId = matched[0]?.id ?? null;
    } else if (dedicated.has(threadId)) {
      marked.add(threadId);
    }
    const kind = kindOf(task);
    return {
      id: task.id,
      kind,
      title: displayTitle(task),
      projectId: task.projectId ?? "",
      project: (task.projectId && projectTitle(task.projectId)) || "No project",
      scheduleLabel: scheduleLabel(task.schedule),
      enabled: task.enabled !== false,
      nextRunAt: task.nextRunAt ?? null,
      lastRunAt: task.lastRunAt ?? null,
      lastRunStatus: task.lastRunStatus && RUN_STATUSES.has(task.lastRunStatus) ? (task.lastRunStatus as AutomationRunStatus) : null,
      lastRunError: task.lastRunError ?? null,
      threadId,
      modelSelection: task.modelSelection ?? null,
      prompt: task.prompt ?? "",
      schedule: kind === "routine" ? routineOf(task.schedule) : null,
      runtimeMode: isRuntimeMode(task.runtimeMode) ? task.runtimeMode : null,
      bound: task.threadId != null,
      webhook: kind === "webhook" ? { url: task.webhook?.url ?? null, signed: task.webhook?.hasSecret === true, filters: webhookFilters(task.schedule?.filters), signature: signatureOf(task) } : null,
      runs: runs[task.id] ?? [],
    };
  });
  const setupThreadIds = [...dedicated].filter((id) => !bound.has(id));
  return { automations, automationThreadIds: [...new Set([...marked, ...setupThreadIds])], setupThreadIds };
}

function titleFromRequest(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

export interface AutomationsOptions {
  port: Pick<T3Port, "threadProjection" | "listScheduledTasks" | "setScheduledTaskEnabled" | "runScheduledTaskNow" | "deleteScheduledTask" | "updateScheduledTask" | "createScheduledTask" | "ensureScratchProject" | "dispatch">;
  store: Pick<ShellStore, "project" | "rawThreads">;
  /** The setup threads that older versions created: the UI marks them as automation sessions. */
  dedicated: { read(): ReadonlySet<string> };
  warn?: (message: string) => void;
  newId?: () => string;
  now?: () => Date;
  /** Marks an edited reminder that already ran, so the guard keeps it enabled. */
  rearmed?: RearmedStore;
  /** The run history; in memory when missing. */
  runs?: AutomationRunLog;
}

export interface Automations {
  list(): Promise<AutomationsResult>;
  /** Creates the scheduled task in T3. The server pauses a reminder after its run. */
  create(body: CreateAutomationBody): Promise<CreateAutomationResult>;
  /** Deletes the T3 scheduled task, and archives the run threads of a reminder. */
  remove(id: string): Promise<void>;
  /** Applies the form to the T3 task. The kind cannot change. A new title also renames the bound thread. */
  update(id: string, body: UpdateAutomationBody): Promise<void>;
  /** Pauses or resumes the T3 task. */
  setEnabled(id: string, enabled: boolean): Promise<void>;
  /** Starts a run of the T3 task now. */
  runNow(id: string): Promise<void>;
}

async function viaT3<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    if (error instanceof IntegrationError) throw error;
    throw new IntegrationError((error as Error).message, { system: "t3", kind: "unreachable" });
  }
}

export function createAutomations(options: AutomationsOptions): Automations {
  const { port, store, dedicated } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());
  const warn = options.warn ?? console.warn;
  const rearmed = options.rearmed ?? new RearmedStore();
  const runs = options.runs ?? new AutomationRunLog();
  // Thread id -> task id read from its first message. A thread is read once per process.
  const links = new Map<string, string | null>();
  const reading = new Set<string>();

  // T3 writes the task id on the first message of a run thread: it ties the thread to its task, whatever its title becomes.
  async function probe(tasks: RawScheduledTask[], threads: RawThread[]): Promise<void> {
    const unbound = tasks.filter((task) => task.threadId == null);
    if (unbound.length === 0) return;
    const since = Math.min(...unbound.map((task) => Date.parse(task.createdAt ?? "") || 0));
    const sources = new Set(unbound.map((task) => task.creationSource));
    const chats = new Set(tasks.map((task) => task.threadId));
    const queue = threads
      .filter((thread) => !links.has(thread.id) && !reading.has(thread.id) && !chats.has(thread.id) && !isHidden(thread) && sources.has(thread.creationSource) && Date.parse(thread.createdAt ?? "") >= since)
      .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""))
      .slice(0, PROBES_PER_LIST);
    const worker = async () => {
      for (let thread = queue.shift(); thread; thread = queue.shift()) {
        reading.add(thread.id);
        try {
          const users = ((await port.threadProjection(thread.id)).messages ?? []).filter((message) => message.role === "user");
          // No user message yet: T3 has not written the first one, so the thread stays unread.
          if (users.length > 0) links.set(thread.id, users.find((message) => message.scheduledTaskId)?.scheduledTaskId ?? null);
        } catch {
          // Left unread: the next list tries again.
        } finally {
          reading.delete(thread.id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PROBE_CONCURRENCY, queue.length) }, worker));
  }

  async function known(id: string): Promise<void> {
    if (!(await viaT3(port.listScheduledTasks())).some((task) => task.id === id)) throw new DomainError("not-found", "This automation no longer exists");
  }

  return {
    async list() {
      const tasks = await viaT3(port.listScheduledTasks());
      const threads = store.rawThreads();
      await probe(tasks, threads);
      runs.record(recordRuns(runs.current(), tasks, threads, now(), links));
      return toAutomations(tasks, threads, dedicated.read(), (id) => store.project(id)?.title || null, runs.current(), links);
    },

    async remove(id) {
      const tasks = await viaT3(port.listScheduledTasks());
      const task = tasks.find((entry) => entry.id === id);
      const owners = threadOwners(tasks, runs.current(), links);
      await viaT3(port.deleteScheduledTask(id));
      runs.drop(id);
      // Without its task, a run thread loses its automation mark. A bound thread is the user's chat: keep it.
      if (!task || task.threadId || !isReminder(task)) return;
      for (const run of runThreads(task, store.rawThreads(), owners)) {
        if (run.archivedAt) continue;
        try {
          await port.dispatch({ ...archiveThreadCommand(run.id), commandId: newId() });
        } catch (error) {
          warn(`Could not archive thread ${run.id} of the deleted reminder: ${(error as Error).message}`);
        }
      }
    },

    async setEnabled(id, enabled) {
      await known(id);
      await viaT3(port.setScheduledTaskEnabled(id, enabled));
    },

    async runNow(id) {
      await known(id);
      await viaT3(port.runScheduledTaskNow(id));
    },

    async update(id, body) {
      const task = (await viaT3(port.listScheduledTasks())).find((entry) => entry.id === id);
      if (!task) throw new DomainError("not-found", "This automation no longer exists");
      if (kindOf(task) !== body.kind) throw new DomainError("invalid", "The kind of an automation cannot change");
      const name = body.title.trim() || titleFromRequest(body.prompt);
      const schedule: ScheduleChange = body.kind === "routine" ? routineSchedule(body.schedule) : body.kind === "reminder" ? reminderSchedule(new Date(body.at), now()) : { type: "webhook", signature: body.signature, filters: body.filters };
      // A bound task runs in its own thread, so its project stays.
      const projectId = (task.threadId ? task.projectId : body.projectId) || (await viaT3(port.ensureScratchProject()));
      // Mark before the call, so the guard cannot pause the reminder between T3's update and the mark.
      // Roll back only a mark this call added: an earlier edit's mark must stay.
      const marked = body.kind === "reminder" && !!task.lastRunAt && !rearmed.has(id, task.lastRunAt);
      if (marked) rearmed.mark(id, task.lastRunAt!);
      try {
        await viaT3(
          port.updateScheduledTask(id, {
            title: body.kind === "reminder" ? `Reminder: ${name}` : name,
            prompt: body.prompt.trim(),
            // A new time re-arms a reminder that ran and paused.
            enabled: body.kind === "reminder" || task.enabled !== false,
            schedule,
            projectId,
            modelSelection: body.modelSelection,
            runtimeMode: body.runtimeMode ?? (isRuntimeMode(task.runtimeMode) ? task.runtimeMode : "full-access"),
          }),
        );
      } catch (error) {
        if (marked) rearmed.unmark(id);
        throw error;
      }
      if (task.threadId && name !== displayTitle(task)) await viaT3(port.dispatch({ ...renameThreadCommand(task.threadId, name), commandId: newId() }));
    },

    async create(body) {
      const id = `scheduled-task:${newId()}`;
      const reminder = body.kind === "reminder";
      const name = body.title.trim() || titleFromRequest(body.prompt);
      const schedule: ScheduleInput = body.kind === "routine" ? routineSchedule(body.schedule) : body.kind === "reminder" ? reminderSchedule(new Date(body.at), now()) : webhookSchedule(body.filters, body.signature);
      const projectId = body.projectId || (await viaT3(port.ensureScratchProject()));
      const created = await viaT3(
        port.createScheduledTask({
          id,
          title: reminder ? `Reminder: ${name}` : name,
          prompt: body.prompt.trim(),
          enabled: true,
          schedule,
          projectId,
          threadId: null,
          workspaceStrategy: { type: "root" },
          modelSelection: body.modelSelection,
          runtimeMode: body.runtimeMode ?? "full-access",
          interactionMode: "default",
          creationSource: "web",
        }),
      );
      return { ok: true, id: created.id, webhookUrl: created.webhook?.url ?? null, nextRunAt: created.nextRunAt ?? null };
    },
  };
}
