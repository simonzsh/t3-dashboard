import { resolveChain } from "../../../../shared/agentSetup.ts";
import { pathTree, type PathNode } from "../../ui/index.ts";
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

export interface TreeNode extends PathNode<SetupFile> {
  children: TreeNode[];
  issues: number;
  worst: Severity | null;
}

const worstOf = (a: Severity | null, b: Severity | null): Severity | null => (a && b ? (RANK[a] >= RANK[b] ? a : b) : (a ?? b));

// "/etc/x" keeps its leading slash on the first folder, so it reads as an absolute path.
function partsOf(shown: string): string[] {
  if (!shown.startsWith("/")) return shown.split("/");
  const [first = "", ...rest] = shown.slice(1).split("/");
  return [`/${first}`, ...rest];
}

/** Files grouped by folder (see pathTree), each folder with the issue count and worst severity below it. */
export function buildTree(files: SetupFile[], home: string): TreeNode[] {
  return pathTree(files, (file) => partsOf(displayPath(file.path, home)), (file) => file.id).map(withIssues);
}

function withIssues(node: PathNode<SetupFile>): TreeNode {
  if (node.item) {
    const worst = node.item.issues.reduce<Severity | null>((w, i) => worstOf(w, i.severity), null);
    return { ...node, children: [], issues: node.item.issues.length, worst };
  }
  const children = node.children.map(withIssues);
  return { ...node, children, issues: children.reduce((n, c) => n + c.issues, 0), worst: children.reduce<Severity | null>((w, c) => worstOf(w, c.worst), null) };
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
