import type { LinearIssue } from "../../../../shared/api.ts";

export interface BoardGroup {
  key: string;
  title: string;
  team: string;
  issues: LinearIssue[];
}

export const NO_PROJECT = "No project";

// Linear priority 0 means "none": it sorts after urgent (1) to low (4).
const priorityRank = (p: number) => (p === 0 ? 5 : p);

export function groupBoard(issues: LinearIssue[]): BoardGroup[] {
  const map = new Map<string, BoardGroup>();
  for (const issue of issues) {
    const key = issue.project ? issue.project.id : `none:${issue.team.key}`;
    let group = map.get(key);
    if (!group) {
      group = { key, title: issue.project?.name ?? NO_PROJECT, team: issue.team.name, issues: [] };
      map.set(key, group);
    }
    group.issues.push(issue);
  }
  for (const g of map.values()) {
    g.issues.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || b.updatedAt.localeCompare(a.updatedAt));
  }
  return [...map.values()].sort(
    (a, b) => Number(a.title === NO_PROJECT) - Number(b.title === NO_PROJECT) || a.title.localeCompare(b.title) || a.team.localeCompare(b.team),
  );
}

export interface BoardColumn {
  name: string;
  color: string;
  count: number;
  groups: BoardGroup[];
}

const TYPE_ORDER = ["triage", "backlog", "unstarted", "started"];
const typeRank = (type: string) => {
  const i = TYPE_ORDER.indexOf(type);
  return i === -1 ? TYPE_ORDER.length : i;
};

// One column per state name, so teams with the same state name share it.
export function boardColumns(issues: LinearIssue[]): BoardColumn[] {
  const map = new Map<string, { type: string; color: string; issues: LinearIssue[] }>();
  for (const issue of issues) {
    const col = map.get(issue.state.name) ?? { type: issue.state.type, color: issue.state.color, issues: [] };
    col.issues.push(issue);
    map.set(issue.state.name, col);
  }
  return [...map.entries()]
    .sort(([an, a], [bn, b]) => typeRank(a.type) - typeRank(b.type) || an.localeCompare(bn))
    .map(([name, c]) => ({ name, color: c.color, count: c.issues.length, groups: groupBoard(c.issues) }));
}
