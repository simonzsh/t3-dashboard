import { isObject } from "../../../../shared/guards.ts";
import { jsonPrefs, usePrefs } from "../../lib/storage.ts";
import { ALL_REPOSITORIES, SCOPES, type Scope } from "./pulls.ts";

export interface PullsPrefs {
  scope: Scope;
  /** A repository name, or ALL_REPOSITORIES. The view falls back to all when it left the list. */
  repository: string;
}

export const PULLS_LIST_KEY = "t3-dashboard-pulls-list";
export const DEFAULT_PULLS_PREFS: PullsPrefs = { scope: "all", repository: ALL_REPOSITORIES };

export function parsePullsPrefs(data: unknown): PullsPrefs {
  if (!isObject(data)) return DEFAULT_PULLS_PREFS;
  return {
    scope: SCOPES.find((s) => s.id === data.scope)?.id ?? DEFAULT_PULLS_PREFS.scope,
    repository: typeof data.repository === "string" && data.repository !== "" ? data.repository : DEFAULT_PULLS_PREFS.repository,
  };
}

const PREFS = jsonPrefs(PULLS_LIST_KEY, parsePullsPrefs);
export const { load: loadPullsPrefs, save: savePullsPrefs } = PREFS;

/** The scope and repository filters of the list, saved in this browser. The search is not kept, as on Automations. */
export const usePullsPrefs = () => usePrefs(PREFS);

export interface PullDetailPrefs {
  /** The file tree beside the diff on a wide screen. */
  filesOpen: boolean;
}

export const PULL_DETAIL_KEY = "t3-dashboard-pull-detail";
export const parsePullDetailPrefs = (data: unknown): PullDetailPrefs => ({ filesOpen: !(isObject(data) && data.filesOpen === false) });

const DETAIL_PREFS = jsonPrefs(PULL_DETAIL_KEY, parsePullDetailPrefs);
export const { load: loadPullDetailPrefs, save: savePullDetailPrefs } = DETAIL_PREFS;

/** Whether the file tree shows beside the diff, saved in this browser. */
export const usePullDetailPrefs = () => usePrefs(DETAIL_PREFS);
