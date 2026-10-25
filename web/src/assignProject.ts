import type { DashboardProject } from "../../shared/api.ts";

type Store = Pick<Storage, "getItem" | "setItem">;

const key = (teamKey: string) => `t3-dashboard-assign-project:${teamKey}`;

/** The project last chosen for a team, or "" when none is saved or it no longer exists. */
export function loadAssignProject(storage: Store, teamKey: string, projects: DashboardProject[]): string {
  try {
    const id = storage.getItem(key(teamKey));
    return id !== null && projects.some((project) => project.id === id) ? id : "";
  } catch {
    return "";
  }
}

// Storage can throw (private mode): the preselection is then lost, nothing else.
export function saveAssignProject(storage: Store, teamKey: string, projectId: string): void {
  try {
    storage.setItem(key(teamKey), projectId);
  } catch {
    // Ignored on purpose.
  }
}
