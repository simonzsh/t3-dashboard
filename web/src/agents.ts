import type { DashboardProject, DashboardThread, PendingCategory } from "../../shared/api.ts";

export type AgentStatus = "waiting" | "working" | "finished";

export interface AgentCard {
  thread: DashboardThread;
  status: AgentStatus;
}

export interface AgentGroup {
  project: { id: string; title: string };
  cards: AgentCard[];
}

const WORKING = new Set(["preparing", "queued", "starting", "running", "waiting"]);
const FINISHED = new Set(["completed", "interrupted", "failed", "cancelled", "rolled_back"]);
const FINISHED_WINDOW_MS = 24 * 60 * 60 * 1000;
const RANK: Record<AgentStatus, number> = { waiting: 0, working: 1, finished: 2 };

// Returns null for threads the Agents tab hides (idle or finished long ago).
export function agentStatus(t: DashboardThread, now: Date): AgentStatus | null {
  if (t.pending) return "waiting";
  if (WORKING.has(t.status)) return "working";
  if (FINISHED.has(t.status) && now.getTime() - Date.parse(t.lastActivityAt) < FINISHED_WINDOW_MS) return "finished";
  return null;
}

const recent = (a: DashboardThread, b: DashboardThread) => b.lastActivityAt.localeCompare(a.lastActivityAt);

export function groupAgents(threads: DashboardThread[], projects: DashboardProject[], now: Date): AgentGroup[] {
  const titles = new Map(projects.map((p) => [p.id, p.title]));
  const byProject = new Map<string, AgentCard[]>();
  for (const thread of threads) {
    const status = agentStatus(thread, now);
    if (!status) continue;
    const cards = byProject.get(thread.projectId) ?? [];
    cards.push({ thread, status });
    byProject.set(thread.projectId, cards);
  }
  const groups: AgentGroup[] = [];
  for (const [id, cards] of byProject) {
    cards.sort((a, b) => RANK[a.status] - RANK[b.status] || recent(a.thread, b.thread));
    groups.push({ project: { id, title: titles.get(id) ?? id }, cards });
  }
  // Cards are sorted, so the first card carries the group's best status; ties go to the most recent activity of any card.
  const latest = (g: AgentGroup) => g.cards.reduce((max, c) => (c.thread.lastActivityAt > max ? c.thread.lastActivityAt : max), "");
  return groups.sort((a, b) => RANK[a.cards[0]!.status] - RANK[b.cards[0]!.status] || latest(b).localeCompare(latest(a)));
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
