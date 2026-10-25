import type { Bucket, DashboardState, DashboardThread } from "../../shared/api.ts";

export function thread(id: string, over: Partial<DashboardThread> = {}): DashboardThread {
  return {
    id,
    projectId: "project-a",
    title: `Thread ${id}`,
    provider: "provider-a",
    model: "model-x",
    status: "idle",
    bucket: "inactive" as Bucket,
    pending: null,
    activeRunId: null,
    backgroundWork: false,
    pendingTasks: false,
    lastError: null,
    hasActionableProposedPlan: false,
    preview: null,
    pinned: false,
    branch: null,
    pullRequestUrl: null,
    createdAt: "2026-01-10T10:00:00.000Z",
    updatedAt: "2026-01-10T10:00:00.000Z",
    lastActivityAt: "2026-01-10T10:00:00.000Z",
    ...over,
  };
}

export function baseState(threads: DashboardThread[] = []): DashboardState {
  return {
    connection: { t3: "live", origin: null, serverVersion: null, protocolMismatch: false, error: null, since: "2026-01-10T10:00:00.000Z", setup: null },
    projects: [{ id: "project-a", title: "Project A", defaultModelSelection: null }],
    providers: [],
    threads,
    generatedAt: "2026-01-10T10:00:00.000Z",
    automationsAvailable: true,
    t3EnvironmentId: null,
  };
}
