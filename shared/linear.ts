// The Linear board and the assign action.

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  url: string;
  state: { name: string; type: string; color: string };
  priority: number;
  priorityLabel: string;
  project: { id: string; name: string } | null;
  team: { key: string; name: string };
  workspace: string;
  updatedAt: string;
}

export interface LinearWorkspaceStatus {
  name: string;
  ok: boolean;
  error: string | null;
}

export interface BoardResult {
  workspaces: LinearWorkspaceStatus[];
  issues: LinearIssue[];
  /** False when no Linear key is set at all: the UI shows the setup card. */
  configured: boolean;
}

export interface AssignIssueBody {
  workspace: string;
  issueId: string;
  agent: "claude" | "codex";
  projectId: string;
}
