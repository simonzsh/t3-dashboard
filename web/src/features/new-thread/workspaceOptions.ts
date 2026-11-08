import type { DashboardProject, ProjectRef, ProjectVcsStatus, WorkspaceChoice } from "../../../../shared/api.ts";

export type EnvMode = "local" | "worktree";

export interface WorkspaceDraft {
  envMode: EnvMode;
  /** Local mode: the branch to check out. Worktree mode: the base. */
  ref: ProjectRef | null;
  /** Local mode: a branch to create, already sanitized. */
  newBranch: string | null;
  startFromOrigin: boolean;
}

export const initialEnvMode = (project: Pick<DashboardProject, "defaultThreadEnvMode">): EnvMode => project.defaultThreadEnvMode ?? "local";

// Same rule as T3 Code, so the name shown is the name created.
export const sanitizeBranchName = (name: string): string => name.trim().replace(/[ \t\n\r\f\v]+/g, "-");

export const defaultBaseRef = (refs: ProjectRef[]): ProjectRef | null => refs.find((r) => r.current) ?? null;

export function initialDraft(project: Pick<DashboardProject, "defaultThreadEnvMode">, refs: ProjectRef[]): WorkspaceDraft {
  const envMode = initialEnvMode(project);
  return { envMode, ref: envMode === "worktree" ? defaultBaseRef(refs) : null, newBranch: null, startFromOrigin: false };
}

/** The `workspace` to send; undefined keeps the current checkout as it is. */
export function toWorkspaceChoice(draft: WorkspaceDraft, workspaceRoot: string): WorkspaceChoice | undefined {
  if (draft.envMode === "worktree") {
    if (!draft.ref) throw new Error("Select a base branch before sending in New worktree mode.");
    return { type: "worktree", baseRef: draft.ref.name, ...(draft.startFromOrigin && { startFromOrigin: true }) };
  }
  if (draft.newBranch) return { type: "root", branch: draft.newBranch, create: true };
  const ref = draft.ref;
  if (!ref || ref.current) return undefined;
  if (ref.worktreePath && ref.worktreePath !== workspaceRoot) return { type: "existing_worktree", worktreePath: ref.worktreePath, branch: ref.name };
  return { type: "root", branch: ref.name };
}

/** Switching or creating a branch in the project folder moves uncommitted work with it. */
export function showDirtyWarning(draft: WorkspaceDraft, workspaceRoot: string, status: Pick<ProjectVcsStatus, "hasChanges">): boolean {
  if (!status.hasChanges || draft.envMode !== "local") return false;
  const choice = toWorkspaceChoice(draft, workspaceRoot);
  return choice?.type === "root";
}
