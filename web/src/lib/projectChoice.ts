import type { DashboardProject } from "../../../shared/api.ts";
import type { Store } from "./storage.ts";

/** The project saved under `key`, or "" when none is saved or it no longer exists. */
export function loadProjectChoice(storage: Store | null, key: string, projects: DashboardProject[]): string {
  try {
    const id = storage?.getItem(key) ?? null;
    return id !== null && projects.some((project) => project.id === id) ? id : "";
  } catch {
    return "";
  }
}

// Storage can throw (private mode): the preselection is then lost, nothing else.
export function saveProjectChoice(storage: Store | null, key: string, projectId: string): void {
  try {
    storage?.setItem(key, projectId);
  } catch {
    // Ignored on purpose.
  }
}
