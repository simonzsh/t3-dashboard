import type { ConnectionStatus } from "./connection.ts";
import type { SessionsUpdate } from "./sessions.ts";
import type { StashEntry } from "./stash.ts";
import type { SeenState } from "./seen.ts";
import type { DashboardProject, DashboardProvider, DashboardThread, ModelDefaults } from "./threads.ts";

// The server-sent events on /api/events.

export interface DashboardState {
  connection: ConnectionStatus;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  modelDefaults: ModelDefaults;
  threads: DashboardThread[];
  /** For t3code:// links; null hides the "Open in T3 Code" buttons. */
  t3EnvironmentId: string | null;
}

export interface Diff<T> {
  upserted: T[];
  removed: string[];
}

export type DashboardEvent =
  | { type: "state"; data: DashboardState }
  | { type: "threads"; data: Diff<DashboardThread> }
  | { type: "projects"; data: Diff<DashboardProject> }
  | { type: "providers"; data: DashboardProvider[] }
  | { type: "modelDefaults"; data: ModelDefaults }
  | { type: "connection"; data: ConnectionStatus }
  | { type: "sessions"; data: SessionsUpdate }
  | { type: "stash"; data: StashEntry[] }
  | { type: "seen"; data: SeenState };

// A record, not a list: a new event type without an entry here fails the type check.
const EVENT_TYPES: Record<DashboardEvent["type"], true> = { state: true, threads: true, projects: true, providers: true, modelDefaults: true, connection: true, sessions: true, stash: true, seen: true };
export const DASHBOARD_EVENT_TYPES = Object.keys(EVENT_TYPES) as DashboardEvent["type"][];
