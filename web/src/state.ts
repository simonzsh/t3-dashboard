import type { DashboardEvent, DashboardState, Diff } from "../../shared/api.ts";

function applyDiff<T extends { id: string }>(list: T[], diff: Diff<T>): T[] {
  const byId = new Map(list.map((x) => [x.id, x]));
  for (const x of diff.upserted) byId.set(x.id, x);
  for (const id of diff.removed) byId.delete(id);
  return [...byId.values()];
}

// Diffs before the first `state` have nothing to apply to, so they are dropped.
export function applyEvent(state: DashboardState | null, event: DashboardEvent): DashboardState | null {
  if (event.type === "state") return event.data;
  if (!state) return null;
  switch (event.type) {
    case "threads":
      return { ...state, threads: applyDiff(state.threads, event.data) };
    case "projects":
      return { ...state, projects: applyDiff(state.projects, event.data) };
    case "providers":
      return { ...state, providers: event.data };
    case "connection":
      return { ...state, connection: event.data };
  }
}
