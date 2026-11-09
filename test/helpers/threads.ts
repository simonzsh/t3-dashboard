import type { DashboardThread } from "../../shared/api.ts";

export function thread(id: string, over: Partial<DashboardThread> = {}): DashboardThread {
  return {
    id,
    projectId: "project-a",
    title: `Thread ${id}`,
    provider: "provider-a",
    model: null,
    status: "idle",
    settled: false,
    pending: null,
    activeRunId: null,
    backgroundWork: false,
    pendingTasks: false,
    lastError: null,
    pinned: false,
    lastActivityAt: "2026-01-10T10:00:00.000Z",
    branch: null,
    pullRequests: [],
    ...over,
  };
}

export const running = (id: string, over: Partial<DashboardThread> = {}) => thread(id, { status: "running", activeRunId: "run-1", ...over });
export const finished = (id: string, over: Partial<DashboardThread> = {}) => thread(id, { status: "completed", ...over });
export const waiting = (id: string, over: Partial<DashboardThread> = {}) => thread(id, { status: "waiting", pending: { category: "approval" }, ...over });
