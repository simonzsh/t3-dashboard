import type { DashboardProject, DashboardProvider, ModelSelection } from "../../../../shared/api.ts";
import { loadProjectChoice, saveProjectChoice } from "../../lib/projectChoice.ts";
import type { Store } from "../../lib/storage.ts";

const TITLE_MAX = 60;
const KEY = "t3-dashboard-new-agent-project";

export function titleFromMessage(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

/** The project of the last New Agent, or "" when none is saved or it no longer exists. */
export const loadNewAgentProject = (storage: Store | null, projects: DashboardProject[]): string => loadProjectChoice(storage, KEY, projects);

export const saveNewAgentProject = (storage: Store | null, projectId: string): void => saveProjectChoice(storage, KEY, projectId);

/** The project's default, else T3's default, else the first model; a default no longer offered is skipped. */
export function presetSelection(project: DashboardProject | undefined, providers: DashboardProvider[], fallback: ModelSelection | null = null): ModelSelection | null {
  const offered = (sel: ModelSelection | null | undefined): sel is ModelSelection => !!sel && providers.some((p) => p.instanceId === sel.instanceId && p.models.some((m) => m.slug === sel.model));
  const sel = [project?.defaultModelSelection, fallback].find(offered);
  if (sel) return sel;
  const first = providers.find((p) => p.models.length > 0);
  return first ? { instanceId: first.instanceId, model: first.models[0]!.slug } : null;
}
