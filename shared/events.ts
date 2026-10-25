import type { ConnectionStatus } from "./connection.ts";
import type { DashboardProject, DashboardProvider, DashboardThread } from "./threads.ts";

// The server-sent events on /api/events.

export interface DashboardState {
  connection: ConnectionStatus;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  threads: DashboardThread[];
  /** At least one t3-agent brain file exists. */
  automationsAvailable: boolean;
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
  | { type: "connection"; data: ConnectionStatus };

// A record, not a list: a new event type without an entry here fails the type check.
const EVENT_TYPES: Record<DashboardEvent["type"], true> = { state: true, threads: true, projects: true, providers: true, connection: true };
export const DASHBOARD_EVENT_TYPES = Object.keys(EVENT_TYPES) as DashboardEvent["type"][];
