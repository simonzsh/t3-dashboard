import type { DashboardProject, DashboardThread, PendingCategory } from "../../../shared/api.ts";
import { agentStatus, type AgentStatus } from "../../../shared/status.ts";

export interface AgentCard {
  thread: DashboardThread;
  status: AgentStatus;
}

export interface AgentGroup {
  project: { id: string; title: string };
  cards: AgentCard[];
  /** Threads in T3 Code's Settled section, most recent first. */
  settled: DashboardThread[];
}

const RANK: Record<AgentStatus, number> = { waiting: 0, working: 1, finished: 2, idle: 3 };

const recent = (a: DashboardThread, b: DashboardThread) => b.lastActivityAt.localeCompare(a.lastActivityAt);

// Like the T3 Code sidebar: every live thread shows, settled ones in their own list.
// A settled thread that waits or works stays a card, so it is never missed.
export function groupAgents(threads: DashboardThread[], projects: DashboardProject[]): AgentGroup[] {
  const titles = new Map(projects.map((p) => [p.id, p.title]));
  const byProject = new Map<string, AgentGroup>();
  for (const thread of threads) {
    const group = byProject.get(thread.projectId) ?? { project: { id: thread.projectId, title: titles.get(thread.projectId) ?? thread.projectId }, cards: [], settled: [] };
    byProject.set(thread.projectId, group);
    const status = agentStatus(thread);
    if (thread.settled && (status === "finished" || status === "idle")) group.settled.push(thread);
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
