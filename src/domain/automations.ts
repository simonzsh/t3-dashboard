import type { Automation, AutomationRequestBody, AutomationRunStatus, AutomationsResult } from "../../shared/api.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { RawScheduledTask, RawThread, T3Port } from "../integrations/t3/schemas.ts";
import { renameThreadCommand } from "../integrations/t3/commands.ts";
import type { Actions } from "./actions.ts";
import { DomainError } from "./errors.ts";
import { scheduleLabel } from "./scheduleLabel.ts";
import type { ShellStore } from "./shellStore.ts";

const REMINDER_PREFIX = /^\s*(?:reminder|rappel)\s*:\s*/i;
const TITLE_MAX = 60;
const RUN_STATUSES = new Set<string>(["running", "succeeded", "failed"] satisfies AutomationRunStatus[]);

const stamp = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : NaN);

// T3 puts no task id on a run thread: the project, title, origin and creation time tie it to its task.
function runThreads(task: RawScheduledTask, threads: RawThread[]): RawThread[] {
  const since = stamp(task.createdAt);
  return threads
    .filter((thread) => thread.projectId === task.projectId && thread.title === task.title && thread.creationSource === task.creationSource && stamp(thread.createdAt) >= since)
    .sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt));
}

/** The tasks of T3 as rows, plus the threads the Agents grid leaves out. */
export function toAutomations(tasks: RawScheduledTask[], threads: RawThread[], dedicated: ReadonlySet<string>, projectTitle: (id: string) => string | null): AutomationsResult {
  const hidden = new Set<string>();
  const bound = new Set<string>();
  const automations = tasks.map((task): Automation => {
    let threadId = task.threadId ?? null;
    if (threadId !== null) bound.add(threadId);
    if (threadId === null) {
      const runs = runThreads(task, threads);
      for (const run of runs) hidden.add(run.id);
      threadId = runs[0]?.id ?? null;
    } else if (dedicated.has(threadId)) {
      hidden.add(threadId);
    }
    const title = task.title ?? "";
    const reminder = REMINDER_PREFIX.test(title);
    return {
      id: task.id,
      kind: reminder ? "reminder" : "routine",
      title: reminder ? title.replace(REMINDER_PREFIX, "") : title,
      projectId: task.projectId ?? "",
      project: (task.projectId && projectTitle(task.projectId)) || "No project",
      scheduleLabel: scheduleLabel(task.schedule),
      enabled: task.enabled !== false,
      nextRunAt: task.nextRunAt ?? null,
      lastRunAt: task.lastRunAt ?? null,
      lastRunStatus: task.lastRunStatus && RUN_STATUSES.has(task.lastRunStatus) ? (task.lastRunStatus as AutomationRunStatus) : null,
      lastRunError: task.lastRunError ?? null,
      threadId,
      model: task.modelSelection?.model ?? null,
    };
  });
  return { automations, hiddenThreadIds: [...hidden], setupThreadIds: [...dedicated].filter((id) => !bound.has(id)) };
}

/** The message that asks an agent to create the scheduled task. Predefined prompts are English. */
export function automationPrompt(request: string): string {
  return `Create a T3 Code scheduled task with the schedule_task tool for this request:

${request.trim()}

Rules:
- Bind the task to this thread (bindToCurrentThread: true): every run comes back here.
- A one-time request is a reminder:
  - the title starts with "Reminder: ";
  - use fixed_time only if its next run falls on the right date (less than 7 days away, right weekday); otherwise use interval, with everyMs equal to the delay until the wanted time;
  - check that nextRunAt is the wanted date;
  - the task prompt ends with "Then disable this scheduled task: call schedule_task with scheduledTaskId <id> and enabled: false. Do not delete it." After you create the task, put the real id in the prompt: call schedule_task again with scheduledTaskId and the new prompt;
  - never delete a reminder: the dashboard shows a disabled reminder as finished.
- Otherwise it is a routine: a short title, without the "Reminder:" prefix.
- The task prompt must stand alone: it says what to do on each run.
- Reply in one line: the schedule and the next run (nextRunAt).`;
}

function titleFromRequest(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

export interface AutomationsOptions {
  port: Pick<T3Port, "listScheduledTasks" | "deleteScheduledTask" | "renameScheduledTask" | "dispatch">;
  store: Pick<ShellStore, "project" | "rawThreads">;
  /** The threads the Agents page created for a scheduled task. */
  dedicated: { read(): ReadonlySet<string>; add(threadId: string): void };
  createThread: Actions["createThread"];
  warn?: (message: string) => void;
  newId?: () => string;
}

export interface Automations {
  list(): Promise<AutomationsResult>;
  /** Starts a thread that asks an agent to schedule the request; returns its id. */
  request(body: AutomationRequestBody): Promise<string>;
  /** Deletes the T3 scheduled task. */
  remove(id: string): Promise<void>;
  /** Renames the T3 task, keeping a "Reminder:" prefix, and the thread it is bound to. */
  rename(id: string, title: string): Promise<void>;
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
  const { port, store, dedicated, createThread } = options;
  const warn = options.warn ?? console.warn;
  const newId = options.newId ?? (() => crypto.randomUUID());

  return {
    async list() {
      const tasks = await viaT3(port.listScheduledTasks());
      return toAutomations(tasks, store.rawThreads(), dedicated.read(), (id) => store.project(id)?.title || null);
    },

    remove: (id) => viaT3(port.deleteScheduledTask(id)),

    async rename(id, title) {
      const name = title.trim();
      if (name === "") throw new DomainError("invalid", "Write a title");
      const task = (await viaT3(port.listScheduledTasks())).find((entry) => entry.id === id);
      if (!task) throw new DomainError("not-found", "This automation no longer exists");
      // A webhook task has another upsert schedule shape, which this rename does not build.
      if (task.schedule?.type === "webhook") throw new DomainError("conflict", "A webhook automation cannot be renamed here");
      const prefix = REMINDER_PREFIX.exec(task.title ?? "")?.[0] ?? "";
      await viaT3(port.renameScheduledTask(id, `${prefix}${name}`));
      if (task.threadId) await viaT3(port.dispatch({ ...renameThreadCommand(task.threadId, name), commandId: newId() }));
    },

    async request({ text, projectId, modelSelection, runtimeMode }) {
      const request = text.trim();
      if (request === "") throw new DomainError("invalid", "Write what to schedule");
      const threadId = await createThread({ projectId, title: titleFromRequest(request), text: automationPrompt(request), modelSelection, ...(runtimeMode && { runtimeMode }) }, []);
      try {
        dedicated.add(threadId);
      } catch (error) {
        // The thread exists: only the grid rule is lost, so the request still succeeds.
        warn(`Could not record the automation thread: ${(error as Error).message}`);
      }
      return threadId;
    },
  };
}
