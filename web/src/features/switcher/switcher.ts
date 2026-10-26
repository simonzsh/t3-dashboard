import type { DashboardProject, DashboardThread, ThreadSearchMatch } from "../../../../shared/api.ts";
import { threadTitle } from "../../lib/threads.ts";

export interface SwitcherRow {
  thread: DashboardThread;
  project: { id: string; title: string; icon: DashboardProject["icon"] };
  snippet?: string;
  source?: ThreadSearchMatch["source"];
}

// The server accepts 2 to 200 characters once trimmed.
export const shouldSearchContent = (query: string): boolean => {
  const n = query.trim().length;
  return n >= 2 && n <= 200;
};

export const moveSelection = (index: number, delta: number, length: number): number => Math.max(0, Math.min(length - 1, index + delta));

function rowOf(thread: DashboardThread, projects: DashboardProject[]): SwitcherRow {
  const project = projects.find((p) => p.id === thread.projectId);
  return { thread, project: { id: thread.projectId, title: project?.title ?? thread.projectId, icon: project?.icon ?? null } };
}

export function titleMatches(threads: DashboardThread[], projects: DashboardProject[], query: string): SwitcherRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return threads
    .map((t) => rowOf(t, projects))
    .filter((r) => threadTitle(r.thread).toLowerCase().includes(q) || r.project.title.toLowerCase().includes(q))
    .sort((a, b) => b.thread.lastActivityAt.localeCompare(a.thread.lastActivityAt));
}

// Title hits lead; content hits add a snippet to them or follow in the server's order.
export function mergeResults(titleHits: SwitcherRow[], content: ThreadSearchMatch[], threads: DashboardThread[], projects: DashboardProject[]): SwitcherRow[] {
  const byId = new Map(threads.map((t) => [t.id, t]));
  const rows = new Map(titleHits.map((r) => [r.thread.id, { ...r }]));
  for (const m of content) {
    const row = rows.get(m.threadId);
    if (row) {
      row.snippet ??= m.snippet;
      row.source ??= m.source;
      continue;
    }
    const thread = byId.get(m.threadId);
    if (thread) rows.set(thread.id, { ...rowOf(thread, projects), snippet: m.snippet, source: m.source });
  }
  return [...rows.values()];
}
