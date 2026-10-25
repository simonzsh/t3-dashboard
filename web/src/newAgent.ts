import type { DashboardProject, DashboardProvider, ModelSelection } from "../../shared/api.ts";
import type { Store } from "./assignProject.ts";

const TITLE_MAX = 60;
const KEY = "t3-dashboard-new-agent-project";

export function titleFromMessage(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find((l) => l !== "") ?? "";
  return line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1).trimEnd()}…` : line;
}

/** The project of the last New Agent, or "" when none is saved or it no longer exists. */
export function loadNewAgentProject(storage: Store | null, projects: DashboardProject[]): string {
  try {
    const id = storage?.getItem(KEY) ?? null;
    return id !== null && projects.some((p) => p.id === id) ? id : "";
  } catch {
    return "";
  }
}

// Storage can throw (private mode): the preselection is then lost, nothing else.
export function saveNewAgentProject(storage: Store | null, projectId: string): void {
  try {
    storage?.setItem(KEY, projectId);
  } catch {
    // Ignored on purpose.
  }
}

export function presetSelection(project: DashboardProject | undefined, providers: DashboardProvider[]): ModelSelection | null {
  const sel = project?.defaultModelSelection;
  if (sel && providers.some((p) => p.instanceId === sel.instanceId && p.models.some((m) => m.slug === sel.model))) return sel;
  const first = providers.find((p) => p.models.length > 0);
  return first ? { instanceId: first.instanceId, model: first.models[0]!.slug } : null;
}
