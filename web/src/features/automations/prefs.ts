import { useCallback } from "react";
import { isObject } from "../../../../shared/guards.ts";
import { readJson, usePersisted, writeKey, type Store } from "../../lib/storage.ts";
import type { AutomationFilter, AutomationSort } from "./automations.ts";

export interface AutomationPrefs {
  filter: AutomationFilter;
  sort: AutomationSort;
}

export const AUTOMATIONS_LIST_KEY = "t3-dashboard-automations-list";
export const DEFAULT_AUTOMATION_PREFS: AutomationPrefs = { filter: "all", sort: "recent" };

const FILTERS: readonly AutomationFilter[] = ["all", "unread", "failed", "running", "paused"];
const SORTS: readonly AutomationSort[] = ["recent", "next", "project"];

export function parseAutomationPrefs(data: unknown): AutomationPrefs {
  if (!isObject(data)) return DEFAULT_AUTOMATION_PREFS;
  return {
    filter: FILTERS.find((f) => f === data.filter) ?? DEFAULT_AUTOMATION_PREFS.filter,
    sort: SORTS.find((s) => s === data.sort) ?? DEFAULT_AUTOMATION_PREFS.sort,
  };
}

export const loadAutomationPrefs = (storage: Store | null): AutomationPrefs => parseAutomationPrefs(readJson(storage, AUTOMATIONS_LIST_KEY));

export const saveAutomationPrefs = (storage: Store | null, prefs: AutomationPrefs): void => writeKey(storage, AUTOMATIONS_LIST_KEY, JSON.stringify(prefs));

/** The filter and the sort of the list, saved in this browser. */
export function useAutomationPrefs(): [AutomationPrefs, (change: Partial<AutomationPrefs>) => void] {
  const [prefs, setPrefs] = usePersisted(loadAutomationPrefs, saveAutomationPrefs);
  return [prefs, useCallback((change: Partial<AutomationPrefs>) => setPrefs((was) => ({ ...was, ...change })), [setPrefs])];
}
