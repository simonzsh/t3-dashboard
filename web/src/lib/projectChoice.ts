import type { DashboardProject } from "../../../shared/api.ts";
import { readKey, writeKey, type Store } from "./storage.ts";

/** The project saved under `key`, or "" when none is saved or it no longer exists. */
export function loadProjectChoice(storage: Store | null, key: string, projects: DashboardProject[]): string {
  const id = readKey(storage, key);
  return id !== null && projects.some((project) => project.id === id) ? id : "";
}

export const saveProjectChoice = (storage: Store | null, key: string, projectId: string): void => writeKey(storage, key, projectId);
