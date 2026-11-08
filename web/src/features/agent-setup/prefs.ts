import { isObject } from "../../../../shared/guards.ts";
import { jsonPrefs, usePrefs } from "../../lib/storage.ts";

export type SetupView = "files" | "effective";

export interface SetupPrefs {
  /** "user" or "project:<id>". The page falls back to "user" when the project is gone. */
  scope: string;
  view: SetupView;
}

export const SETUP_KEY = "t3-dashboard-setup";
export const USER_SCOPE = "user";
export const DEFAULT_SETUP_PREFS: SetupPrefs = { scope: USER_SCOPE, view: "files" };

export function parseSetupPrefs(data: unknown): SetupPrefs {
  if (!isObject(data)) return DEFAULT_SETUP_PREFS;
  return {
    scope: typeof data.scope === "string" && data.scope !== "" ? data.scope : DEFAULT_SETUP_PREFS.scope,
    view: data.view === "effective" ? "effective" : "files",
  };
}

const PREFS = jsonPrefs(SETUP_KEY, parseSetupPrefs);
export const { load: loadSetupPrefs, save: saveSetupPrefs } = PREFS;

/** The scope and view of the Setup page, saved in this browser. */
export const useSetupPrefs = () => usePrefs(PREFS);
