import type { Automation, DashboardThread } from "../../shared/api.ts";

export type LastRun = { kind: "waiting" } | { kind: "running" } | { kind: "failed" } | { kind: "done"; at: string };

const ACTIVE = new Set(["preparing", "queued", "starting", "running", "waiting"]);
const DAYS = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const DAY_MS = 86_400_000;

// Routine threads live only in the automations column; reminder targets stay agents.
export function excludeRoutineThreads(threads: DashboardThread[], automations: Automation[]): DashboardThread[] {
  const ids = new Set(automations.flatMap((a) => (a.kind === "routine" && a.threadId ? [a.threadId] : [])));
  return ids.size === 0 ? threads : threads.filter((t) => !ids.has(t.id));
}

const reminderAt = (a: Automation) => (a.schedule.kind === "once" ? a.schedule.at : (a.nextRunAt ?? ""));

export function splitAutomations(list: Automation[]): { routines: Automation[]; reminders: Automation[] } {
  const routines = list
    .filter((a) => a.kind === "routine")
    .sort((a, b) => Number(a.nextRunAt === null) - Number(b.nextRunAt === null) || (a.nextRunAt ?? "").localeCompare(b.nextRunAt ?? ""));
  const reminders = list.filter((a) => a.kind === "reminder").sort((a, b) => reminderAt(a).localeCompare(reminderAt(b)));
  return { routines, reminders };
}

const two = (n: number) => String(n).padStart(2, "0");
const hm = (d: Date) => `${d.getHours()}:${two(d.getMinutes())}`;

// t3-agent keeps no run result: the routine thread's status is the only signal.
export function lastRunState(t: DashboardThread | undefined): LastRun | null {
  if (!t) return null;
  // A routine blocked on the user must say so: its thread is hidden from the agents grid.
  if (t.pending) return { kind: "waiting" };
  if (ACTIVE.has(t.status)) return { kind: "running" };
  if (t.status === "failed" || t.lastError !== null) return { kind: "failed" };
  const at = new Date(t.lastActivityAt);
  return { kind: "done", at: `${two(at.getHours())}:${two(at.getMinutes())}` };
}

export function nextLabel(iso: string | null, now: Date): string {
  if (!iso) return "";
  const at = new Date(iso);
  const min = Math.floor((at.getTime() - now.getTime()) / 60_000);
  if (min < 1) return "maintenant";
  if (min < 60) return `dans ${min} min`;
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(at) - midnight(now)) / DAY_MS);
  if (days === 0) return `aujourd'hui ${hm(at)}`;
  if (days === 1) return `demain ${hm(at)}`;
  if (days < 7) return `${DAYS[at.getDay()]} ${hm(at)}`;
  return reminderDate(iso);
}

export function reminderDate(iso: string): string {
  const at = new Date(iso);
  return `${at.getDate()} ${MONTHS[at.getMonth()]} ${hm(at)}`;
}
