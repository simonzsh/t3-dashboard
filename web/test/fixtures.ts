import type { DashboardState, DashboardThread } from "../../shared/api.ts";

export function thread(id: string, over: Partial<DashboardThread> = {}): DashboardThread {
  return {
    id,
    projectId: "project-a",
    title: `Thread ${id}`,
    provider: "provider-a",
    status: "idle",
    settled: false,
    pending: null,
    activeRunId: null,
    backgroundWork: false,
    pendingTasks: false,
    lastError: null,
    preview: null,
    pinned: false,
    lastActivityAt: "2026-01-10T10:00:00.000Z",
    ...over,
  };
}

export function baseState(threads: DashboardThread[] = []): DashboardState {
  return {
    connection: { t3: "live", serverVersion: null, protocolMismatch: false, error: null, setup: null },
    projects: [{ id: "project-a", title: "Project A", defaultModelSelection: null }],
    providers: [],
    threads,
    automationsAvailable: true,
    t3EnvironmentId: null,
  };
}
