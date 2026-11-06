import type { DashboardThread, PendingCategory } from "../../../shared/api.ts";

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

/** Sort comparator: the most recent activity first. */
export const newestFirst = (a: DashboardThread, b: DashboardThread): number => b.lastActivityAt.localeCompare(a.lastActivityAt);
