import type { AssignIssueBody, DashboardProject, DashboardProvider, DashboardThread, LinearIssue, ModelDefaults } from "../../../../shared/api.ts";
import { DEFAULT_RUNTIME_MODE, presetSelection } from "../new-thread/newAgent.ts";

const IDENTIFIER = /\b[A-Z][A-Z0-9]*-\d+\b/g;

/** Issue identifiers named in thread titles: assigning an issue titles the thread after it. */
export function linkedIdentifiers(threads: DashboardThread[]): Set<string> {
  return new Set(threads.flatMap((t) => t.title.toUpperCase().match(IDENTIFIER) ?? []));
}

// Linear's 0 means "no priority" and sorts after low.
const rank = (priority: number) => (priority === 0 ? 5 : priority);

export function ticketsWithoutAgent(issues: LinearIssue[], threads: DashboardThread[]): LinearIssue[] {
  const linked = linkedIdentifiers(threads);
  return issues
    .filter((i) => !linked.has(i.identifier.toUpperCase()))
    .sort((a, b) => rank(a.priority) - rank(b.priority) || b.updatedAt.localeCompare(a.updatedAt));
}

export type TicketStart = { kind: "direct"; project: DashboardProject; body: AssignIssueBody } | { kind: "dialog" };

// Direct only when the team has a saved project and a model is offered; else the user picks in the dialog.
export function ticketStart(issue: LinearIssue, savedProjectId: string, projects: DashboardProject[], providers: DashboardProvider[], defaults: ModelDefaults): TicketStart {
  const project = savedProjectId === "" ? undefined : projects.find((p) => p.id === savedProjectId);
  const modelSelection = project && presetSelection(project, providers, defaults.selection);
  if (!project || !modelSelection) return { kind: "dialog" };
  return { kind: "direct", project, body: { issueId: issue.id, projectId: project.id, text: "", modelSelection, runtimeMode: defaults.runtimeMode ?? DEFAULT_RUNTIME_MODE } };
}
