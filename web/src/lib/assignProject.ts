import type { DashboardProject } from "../../../shared/api.ts";
import { loadProjectChoice, saveProjectChoice } from "./projectChoice.ts";
import type { Store } from "./storage.ts";

const key = (teamKey: string) => `t3-dashboard-assign-project:${teamKey}`;

/** The project last chosen for a team, or "" when none is saved or it no longer exists. */
export const loadAssignProject = (storage: Store | null, teamKey: string, projects: DashboardProject[]): string => loadProjectChoice(storage, key(teamKey), projects);

export const saveAssignProject = (storage: Store | null, teamKey: string, projectId: string): void => saveProjectChoice(storage, key(teamKey), projectId);
