// The Linear board.

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
  updatedAt: string;
}

export interface BoardResult {
  /** False when no Linear key is set: the UI shows the setup card. */
  configured: boolean;
  /** False when the issues could not be read; `error` then says why. */
  ok: boolean;
  error: string | null;
  issues: LinearIssue[];
}
