import type { Automation, AutomationRequestBody, AutomationRunStatus, AutomationsResult } from "../../shared/api.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { RawScheduledTask, RawThread, T3Port } from "../integrations/t3/schemas.ts";
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
  - the task prompt ends with "Then delete this scheduled task with delete_scheduled_task (id <id>)." After you create the task, put the real id in the prompt with update_scheduled_task.
- Otherwise it is a routine: a short title, without the "Reminder:" prefix.
- The task prompt must stand alone: it says what to do on each run.
- Reply in one line: the schedule and the next run (nextRunAt).`;
}

function titleFromRequest(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

export interface AutomationsOptions {
  port: Pick<T3Port, "listScheduledTasks">;
  store: Pick<ShellStore, "project" | "rawThreads">;
  /** The threads the Agents page created for a scheduled task. */
  dedicated: { read(): ReadonlySet<string>; add(threadId: string): void };
  createThread: Actions["createThread"];
  warn?: (message: string) => void;
}

export interface Automations {
  list(): Promise<AutomationsResult>;
  /** Starts a thread that asks an agent to schedule the request; returns its id. */
  request(body: AutomationRequestBody): Promise<string>;
}

export function createAutomations(options: AutomationsOptions): Automations {
  const { port, store, dedicated, createThread } = options;
  const warn = options.warn ?? console.warn;

  return {
    async list() {
      let tasks: RawScheduledTask[];
      try {
        tasks = await port.listScheduledTasks();
      } catch (error) {
        if (error instanceof IntegrationError) throw error;
        throw new IntegrationError((error as Error).message, { system: "t3", kind: "unreachable" });
      }
      return toAutomations(tasks, store.rawThreads(), dedicated.read(), (id) => store.project(id)?.title || null);
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
