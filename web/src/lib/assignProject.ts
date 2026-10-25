import type { DashboardProject } from "../../../shared/api.ts";
import type { Store } from "./storage.ts";

const key = (teamKey: string) => `t3-dashboard-assign-project:${teamKey}`;

/** The project last chosen for a team, or "" when none is saved or it no longer exists. */
export function loadAssignProject(storage: Store | null, teamKey: string, projects: DashboardProject[]): string {
  try {
    const id = storage?.getItem(key(teamKey)) ?? null;
    return id !== null && projects.some((project) => project.id === id) ? id : "";
  } catch {
    return "";
  }
}

// Storage can throw (private mode): the preselection is then lost, nothing else.
export function saveAssignProject(storage: Store | null, teamKey: string, projectId: string): void {
  try {
    storage?.setItem(key(teamKey), projectId);
  } catch {
    // Ignored on purpose.
  }
}
