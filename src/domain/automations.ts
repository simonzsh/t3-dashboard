import type { Automation, AutomationRunStatus, AutomationsResult, CreateAutomationBody, CreateAutomationResult } from "../../shared/api.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { RawScheduledTask, RawThread, ScheduleInput, T3Port } from "../integrations/t3/schemas.ts";
import { renameThreadCommand } from "../integrations/t3/commands.ts";
import { reminderSchedule, routineSchedule, webhookSchedule } from "./automationSchedule.ts";
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
      // Each webhook event is its own job: keep its thread in the Agents grid.
      if (task.schedule?.type !== "webhook") for (const run of runs) hidden.add(run.id);
      threadId = runs[0]?.id ?? null;
    } else if (dedicated.has(threadId)) {
      hidden.add(threadId);
    }
    const title = task.title ?? "";
    const isWebhook = task.schedule?.type === "webhook";
    const reminder = !isWebhook && REMINDER_PREFIX.test(title);
    return {
      id: task.id,
      kind: isWebhook ? "webhook" : reminder ? "reminder" : "routine",
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
      webhook: isWebhook ? { url: task.webhook?.url ?? null, signed: task.webhook?.hasSecret === true } : null,
    };
  });
  return { automations, hiddenThreadIds: [...hidden], setupThreadIds: [...dedicated].filter((id) => !bound.has(id)) };
}

function titleFromRequest(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

export interface AutomationsOptions {
  port: Pick<T3Port, "listScheduledTasks" | "deleteScheduledTask" | "renameScheduledTask" | "createScheduledTask" | "ensureScratchProject" | "dispatch">;
  store: Pick<ShellStore, "project" | "rawThreads">;
  /** The setup threads that older versions created: still hidden from the Agents grid. */
  dedicated: { read(): ReadonlySet<string> };
  newId?: () => string;
  now?: () => Date;
}

export interface Automations {
  list(): Promise<AutomationsResult>;
  /** Creates the scheduled task in T3. A reminder pauses itself after its run. */
  create(body: CreateAutomationBody): Promise<CreateAutomationResult>;
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
  const { port, store, dedicated } = options;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date());

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
      const prefix = REMINDER_PREFIX.exec(task.title ?? "")?.[0] ?? "";
      await viaT3(port.renameScheduledTask(id, `${prefix}${name}`));
      if (task.threadId) await viaT3(port.dispatch({ ...renameThreadCommand(task.threadId, name), commandId: newId() }));
    },

    async create(body) {
      const id = `scheduled-task:${newId()}`;
      const reminder = body.kind === "reminder";
      const name = body.title.trim() || titleFromRequest(body.prompt);
      const schedule: ScheduleInput = body.kind === "routine" ? routineSchedule(body.schedule) : body.kind === "reminder" ? reminderSchedule(new Date(body.at), now()) : webhookSchedule(body.filters, body.signature);
      // T3 has no one-shot task: the run pauses its own task, so the prompt carries the real id.
      const prompt = reminder ? `${body.prompt.trim()}\n\nThen disable this scheduled task: call schedule_task with scheduledTaskId ${id} and enabled: false. Do not delete it.` : body.prompt.trim();
      const projectId = body.projectId || (await viaT3(port.ensureScratchProject()));
      const created = await viaT3(
        port.createScheduledTask({
          id,
          title: reminder ? `Reminder: ${name}` : name,
          prompt,
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
