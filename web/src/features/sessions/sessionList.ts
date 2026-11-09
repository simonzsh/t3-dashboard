import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { isObject, uniqueStrings } from "../../../../shared/guards.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { threadState } from "../../../../shared/status.ts";
import { jsonPrefs, usePrefs } from "../../lib/storage.ts";
import { newestFirst } from "../../lib/threads.ts";

type ListMode = "grouped" | "flat";

export interface ListPrefs {
  hidden: boolean;
  mode: ListMode;
  /** Project ids folded in grouped mode. */
  collapsed: string[];
}

export const SESSION_LIST_KEY = "t3-dashboard-sessions-list";
export const DEFAULT_LIST_PREFS: ListPrefs = { hidden: false, mode: "grouped", collapsed: [] };

type StatusMark = "running" | "waiting" | "error" | "unread" | null;

/** The states that ask for attention; a done or idle thread has none. */
export function attentionState(t: DashboardThread): "waiting" | "running" | "error" | null {
  const state = threadState(t);
  return state === "running" || state === "waiting" || state === "error" ? state : null;
}

/** The mark before a row: what asks for attention, then a dot for an unread result. */
export function statusMark(t: DashboardThread, seen: SeenState): StatusMark {
  return attentionState(t) ?? (isUnseen(t, seen) ? "unread" : null);
}

/** A row the Sessions badges count: a running or an unread mark. */
function inBadge(t: DashboardThread, seen: SeenState): boolean {
  const mark = statusMark(t, seen);
  return mark === "running" || mark === "unread";
}

/** The Sessions nav badge: the sum of the project badges of the list. */
export function sessionsBadgeCount(threads: readonly DashboardThread[], seen: SeenState): number {
  return listableThreads(threads).filter((t) => inBadge(t, seen)).length;
}

/** Settled threads leave the list, except one that runs or waits: like on the Dashboard, it is never missed. */
export function listableThreads(threads: readonly DashboardThread[]): DashboardThread[] {
  return threads
    .filter((t) => {
      const state = threadState(t);
      return !t.settled || state === "running" || state === "waiting";
    })
    .sort(newestFirst);
}

/** Use the settlement time, not the last message: an old conversation can be settled today. */
export function recentSettledThreads(threads: readonly DashboardThread[], now: Date): DashboardThread[] {
  const cutoff = now.getTime() - 24 * 3_600_000;
  return threads.filter((t) => {
    const state = threadState(t);
    const at = Date.parse(t.settledAt ?? "");
    return t.settled && state !== "running" && state !== "waiting" && at >= cutoff && at <= now.getTime();
  }).sort((a, b) => Date.parse(b.settledAt!) - Date.parse(a.settledAt!));
}

interface ProjectGroup {
  id: string;
  /** null when the shell no longer lists the project. */
  project: DashboardProject | null;
  title: string;
  threads: DashboardThread[];
  /** Running and unread threads: the project badge, with the rule of the Sessions nav badge. */
  badge: number;
}

/**
 * Projects with a listed thread first, in T3's order; then "Unknown project" groups for orphan threads;
 * then the empty projects in T3's order. An archived project with no listed thread is left out.
 */
export function groupByProject(threads: readonly DashboardThread[], projects: readonly DashboardProject[], seen: SeenState): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>(projects.map((p) => [p.id, { id: p.id, project: p, title: p.title, threads: [], badge: 0 }]));
  for (const t of threads) {
    let group = groups.get(t.projectId);
    if (!group) {
      group = { id: t.projectId, project: null, title: "Unknown project", threads: [], badge: 0 };
      groups.set(t.projectId, group);
    }
    group.threads.push(t);
    if (inBadge(t, seen)) group.badge += 1;
  }
  const all = [...groups.values()];
  const known = all.filter((g) => g.project !== null);
  return [
    ...known.filter((g) => g.threads.length > 0),
    ...all.filter((g) => g.project === null),
    ...known.filter((g) => g.threads.length === 0 && !g.project?.archived),
  ];
}

export function parseListPrefs(data: unknown): ListPrefs {
  if (!isObject(data)) return DEFAULT_LIST_PREFS;
  return { hidden: data.hidden === true, mode: data.mode === "flat" ? "flat" : "grouped", collapsed: uniqueStrings(data.collapsed) };
}

const PREFS = jsonPrefs(SESSION_LIST_KEY, parseListPrefs);
export const { load: loadListPrefs, save: saveListPrefs } = PREFS;

/** The list panel's choices, saved in this browser. */
export const useListPrefs = () => usePrefs(PREFS);
