import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
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
    projects: [{ id: "project-a", title: "Project A", defaultModelSelection: null, icon: null }],
    providers: [],
    modelDefaults: { selection: null, runtimeMode: null },
    threads,
    automationsAvailable: true,
    t3EnvironmentId: null,
  };
}

/** In-memory localStorage; `data` shows what was saved. */
export function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value) };
}

/** Every .tsx file of web/src, with its path relative to web/src. */
export function tsxSources(): Array<{ file: string; text: string }> {
  const root = join(import.meta.dir, "../src");
  return readdirSync(root, { recursive: true })
    .map(String)
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => ({ file, text: readFileSync(join(root, file), "utf8") }));
}
