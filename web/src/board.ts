import type { LinearIssue } from "../../shared/api.ts";

export interface BoardGroup {
  key: string;
  title: string;
  workspace: string;
  issues: LinearIssue[];
}

export const NO_PROJECT = "Sans projet";

// Linear priority 0 means "none": it sorts after urgent (1) to low (4).
const priorityRank = (p: number) => (p === 0 ? 5 : p);

export function groupBoard(issues: LinearIssue[]): BoardGroup[] {
  const map = new Map<string, BoardGroup>();
  for (const issue of issues) {
    const key = issue.project ? issue.project.id : `none:${issue.workspace}`;
    let group = map.get(key);
    if (!group) {
      group = { key, title: issue.project?.name ?? NO_PROJECT, workspace: issue.workspace, issues: [] };
      map.set(key, group);
    }
    group.issues.push(issue);
  }
  for (const g of map.values()) {
    g.issues.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.updatedAt.localeCompare(a.updatedAt));
  }
  return [...map.values()].sort(
    (a, b) => Number(a.title === NO_PROJECT) - Number(b.title === NO_PROJECT) || a.title.localeCompare(b.title) || a.workspace.localeCompare(b.workspace),
  );
}
