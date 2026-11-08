import { resolveChain } from "../../../../shared/agentSetup.ts";
import type { AgentSetupInventory, AgentTool, McpOverview, McpServerStatus, SetupFile, SetupIssue, SetupScope } from "../../../../shared/api.ts";

type Severity = SetupIssue["severity"];
const RANK: Record<Severity, number> = { info: 1, warning: 2, error: 3 };

// Must match MASK in src/domain/secretMask.ts (server code, not importable from the web).
const MASK = "••••••";
export const isMasked = (text: string): boolean => text.includes(MASK);

/** `~/…` for a path under home; any other path is shown as it is. */
export function displayPath(path: string, home: string): string {
  if (path === home) return "~";
  return home !== "/" && path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export interface TreeNode {
  /** Unique key: the folder path as displayed, or the file id. */
  key: string;
  name: string;
  file: SetupFile | null;
  children: TreeNode[];
  issues: number;
  worst: Severity | null;
}

const worstOf = (a: Severity | null, b: Severity | null): Severity | null => (a && b ? (RANK[a] >= RANK[b] ? a : b) : (a ?? b));

/** Files grouped by folder, in first-seen order. A folder whose only child is a folder merges with it. */
export function buildTree(files: SetupFile[], home: string): TreeNode[] {
  const roots: TreeNode[] = [];
  for (const file of files) {
    const shown = displayPath(file.path, home);
    const parts = shown.startsWith("/") ? ["/" + shown.slice(1).split("/")[0], ...shown.slice(1).split("/").slice(1)] : shown.split("/");
    let level = roots;
    let prefix = "";
    parts.slice(0, -1).forEach((part) => {
      prefix = prefix ? `${prefix}/${part}` : part;
      let dir = level.find((n) => !n.file && n.key === prefix);
      if (!dir) level.push((dir = { key: prefix, name: part, file: null, children: [], issues: 0, worst: null }));
      level = dir.children;
    });
    const worst = file.issues.reduce<Severity | null>((w, i) => worstOf(w, i.severity), null);
    level.push({ key: file.id, name: parts[parts.length - 1]!, file, children: [], issues: file.issues.length, worst });
  }
  return roots.map(summarise);
}

// Folders take the counts of what is below them, and absorb a lone sub-folder.
function summarise(node: TreeNode): TreeNode {
  if (node.file) return node;
  let current = { ...node, children: node.children.map(summarise) };
  while (current.children.length === 1 && !current.children[0]!.file) {
    const only = current.children[0]!;
    current = { ...only, name: `${current.name}/${only.name}` };
  }
  return {
    ...current,
    issues: current.children.reduce((n, c) => n + c.issues, 0),
    worst: current.children.reduce<Severity | null>((w, c) => worstOf(w, c.worst), null),
  };
}

export interface IssueTotals { error: number; warning: number; info: number }

export function issueTotals(files: SetupFile[], extra: SetupIssue[] = []): IssueTotals {
  const totals = { error: 0, warning: 0, info: 0 };
  for (const issue of [...files.flatMap((f) => f.issues), ...extra]) totals[issue.severity] += 1;
  return totals;
}

/** The files of the user scope (`projectId` null) or of one project. */
export function scopeFiles(inv: AgentSetupInventory, projectId: string | null): SetupFile[] {
  const ids = projectId === null ? inv.userFileIds : (inv.projects.find((p) => p.projectId === projectId)?.fileIds ?? []);
  return ids.flatMap((id) => inv.files[id] ?? []);
}

export interface ChainRow {
  fileId: string;
  order: number;
  path: string;
  scope: SetupScope;
  layer: string;
  active: boolean;
  note: string | undefined;
  issues: number;
}

export function chainRows(inv: AgentSetupInventory, projectId: string, tool: AgentTool): ChainRow[] {
  const chain = resolveChain(inv, projectId, tool);
  return (chain?.entries ?? []).map((e) => ({ fileId: e.fileId, order: e.order, path: displayPath(e.path, inv.home), scope: e.scope, layer: e.layer, active: e.active, note: e.note, issues: e.issues.length }));
}

export const statusByServer = (overview: McpOverview | null): Map<string, McpServerStatus> => new Map((overview?.servers ?? []).map((s) => [s.serverId, s]));
