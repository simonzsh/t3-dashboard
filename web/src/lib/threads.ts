import type { DashboardProject, DashboardThread, PendingCategory, ProjectIcon } from "../../../shared/api.ts";
import { agentStatus, type AgentStatus } from "../../../shared/status.ts";

export interface AgentCard {
  thread: DashboardThread;
  status: AgentStatus;
}

export interface AgentGroup {
  project: { id: string; title: string; icon: ProjectIcon | null };
  cards: AgentCard[];
  /** Recent threads of T3 Code's Settled section, most recent first. */
  settled: DashboardThread[];
}

const RANK: Record<AgentStatus, number> = { waiting: 0, working: 1, finished: 2, idle: 3 };

/** Older settled threads are hidden: there are hundreds of them. */
export const RECENT_SETTLED_MS = 3 * 24 * 3_600_000;

const recent = (a: DashboardThread, b: DashboardThread) => b.lastActivityAt.localeCompare(a.lastActivityAt);

// Like the T3 Code sidebar: every live thread shows, settled ones in their own list.
// A settled thread that waits or works stays a card, so it is never missed.
export function groupAgents(threads: DashboardThread[], projects: DashboardProject[], now: Date): AgentGroup[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const byProject = new Map<string, AgentGroup>();
  const since = new Date(now.getTime() - RECENT_SETTLED_MS).toISOString();
  for (const thread of threads) {
    const status = agentStatus(thread);
    const settled = thread.settled && (status === "finished" || status === "idle");
    if (settled && thread.lastActivityAt < since) continue;
    const group = byProject.get(thread.projectId) ?? { project: { id: thread.projectId, title: byId.get(thread.projectId)?.title ?? thread.projectId, icon: byId.get(thread.projectId)?.icon ?? null }, cards: [], settled: [] };
    byProject.set(thread.projectId, group);
    if (settled) group.settled.push(thread);
    else group.cards.push({ thread, status });
  }
  const groups = [...byProject.values()];
  for (const g of groups) {
    g.cards.sort((a, b) => RANK[a.status] - RANK[b.status] || recent(a.thread, b.thread));
    g.settled.sort(recent);
  }
  // Cards are sorted, so the first card carries the group's best status; settled-only groups go last.
  const rank = (g: AgentGroup) => (g.cards[0] ? RANK[g.cards[0].status] : Object.keys(RANK).length);
  const latest = (g: AgentGroup) => g.cards.reduce((max, c) => (c.thread.lastActivityAt > max ? c.thread.lastActivityAt : max), g.cards.length > 0 ? "" : (g.settled[0]?.lastActivityAt ?? ""));
  return groups.sort((a, b) => rank(a) - rank(b) || latest(b).localeCompare(latest(a)));
}

export function providerKind(provider: string): "claude" | "codex" | "other" {
  const p = provider.toLowerCase();
  if (p.includes("claude")) return "claude";
  return p.includes("codex") ? "codex" : "other";
}

export function pendingLabel(category: PendingCategory): string {
  if (category === "approval") return "Approval";
  return category === "user-input" ? "Question" : "Action required";
}

export const threadTitle = (thread: DashboardThread | null | undefined): string => thread?.title || "(untitled)";
