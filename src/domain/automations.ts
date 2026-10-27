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
  const automations = tasks.map((task): Automation => {
    let threadId = task.threadId ?? null;
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
  return { automations, hiddenThreadIds: [...hidden] };
}

/** The message that asks an agent to create the scheduled task; French like the rest of the agent prompts. */
export function automationPrompt(request: string): string {
  return `Crée une tâche planifiée T3 Code avec l'outil schedule_task pour cette demande :

${request.trim()}

Règles :
- Lie la tâche à ce fil (bindToCurrentThread: true) : chaque passage revient ici.
- Demande ponctuelle (une seule fois) = rappel :
  - le titre commence par "Reminder: " ;
  - fixed_time seulement si son prochain passage tombe à la bonne date (moins de 7 jours, bon jour de la semaine) ; sinon interval, avec everyMs égal au délai jusqu'à l'heure voulue ;
  - vérifie que nextRunAt est la date voulue ;
  - le prompt de la tâche finit par « Ensuite, supprime cette tâche planifiée avec delete_scheduled_task (id <id>). » Après la création, mets le vrai id dans le prompt avec update_scheduled_task.
- Sinon c'est une routine : titre court, sans préfixe "Reminder:".
- Le prompt de la tâche se suffit à lui-même : il dit quoi faire à chaque passage.
- Réponds en une ligne : la cadence et le prochain passage (nextRunAt).`;
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
