import { useCallback, useEffect, useState } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { isUnseen, type SeenState } from "../../../../shared/seen.ts";
import { threadState } from "../../../../shared/status.ts";
import { browserStorage, readKey, writeKey, type Store } from "../../lib/storage.ts";

export type ListMode = "grouped" | "flat";

export interface ListPrefs {
  hidden: boolean;
  mode: ListMode;
  /** Project ids folded in grouped mode. */
  collapsed: string[];
}

export const SESSION_LIST_KEY = "t3-dashboard-sessions-list";
export const DEFAULT_LIST_PREFS: ListPrefs = { hidden: false, mode: "grouped", collapsed: [] };

export type StatusMark = "running" | "waiting" | "error" | "unread" | null;

/** The mark before a row: what asks for attention, then a dot for an unread result. */
export function statusMark(t: DashboardThread, seen: SeenState): StatusMark {
  const state = threadState(t);
  if (state === "running" || state === "waiting" || state === "error") return state;
  return isUnseen(t, seen) ? "unread" : null;
}

const newestFirst = (a: DashboardThread, b: DashboardThread) => b.lastActivityAt.localeCompare(a.lastActivityAt);

/** Settled threads leave the list, except one that runs or waits: like on the Dashboard, it is never missed. */
export function listableThreads(threads: readonly DashboardThread[]): DashboardThread[] {
  return threads
    .filter((t) => {
      const state = threadState(t);
      return !t.settled || state === "running" || state === "waiting";
    })
    .sort(newestFirst);
}

export interface ProjectGroup {
  id: string;
  /** null when the shell no longer lists the project. */
  project: DashboardProject | null;
  title: string;
  threads: DashboardThread[];
  running: number;
  unread: number;
}

/** One group per T3 project that has a listed thread, in T3's order. */
export function groupByProject(threads: readonly DashboardThread[], projects: readonly DashboardProject[], seen: SeenState): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>(projects.map((p) => [p.id, { id: p.id, project: p, title: p.title, threads: [], running: 0, unread: 0 }]));
  for (const t of threads) {
    let group = groups.get(t.projectId);
    if (!group) {
      group = { id: t.projectId, project: null, title: "Unknown project", threads: [], running: 0, unread: 0 };
      groups.set(t.projectId, group);
    }
    group.threads.push(t);
    const mark = statusMark(t, seen);
    if (mark === "running") group.running += 1;
    else if (mark === "unread") group.unread += 1;
  }
  return [...groups.values()].filter((g) => g.threads.length > 0);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseListPrefs(raw: string | null): ListPrefs {
  let data: unknown;
  try {
    data = raw === null ? null : JSON.parse(raw);
  } catch {
    return DEFAULT_LIST_PREFS;
  }
  if (!isObject(data)) return DEFAULT_LIST_PREFS;
  const collapsed = Array.isArray(data.collapsed) ? data.collapsed.filter((id, i, all): id is string => typeof id === "string" && all.indexOf(id) === i) : [];
  return { hidden: data.hidden === true, mode: data.mode === "flat" ? "flat" : "grouped", collapsed };
}

export const loadListPrefs = (storage: Store | null): ListPrefs => parseListPrefs(readKey(storage, SESSION_LIST_KEY));

export const saveListPrefs = (storage: Store | null, prefs: ListPrefs): void => writeKey(storage, SESSION_LIST_KEY, JSON.stringify(prefs));

/** The list panel's choices, saved in this browser. */
export function useListPrefs(): [ListPrefs, (change: Partial<ListPrefs>) => void] {
  const [prefs, setPrefs] = useState(() => loadListPrefs(browserStorage()));
  useEffect(() => saveListPrefs(browserStorage(), prefs), [prefs]);
  return [prefs, useCallback((change: Partial<ListPrefs>) => setPrefs((was) => ({ ...was, ...change })), [])];
}
