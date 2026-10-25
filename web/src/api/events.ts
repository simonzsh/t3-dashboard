import { useEffect, useReducer, useState } from "react";
import type { DashboardEvent, DashboardState, Diff } from "../../../shared/api.ts";
import { DASHBOARD_EVENT_TYPES } from "../../../shared/events.ts";

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

export function useDashboard(): { state: DashboardState | null; sseDown: boolean; lastEvent: DashboardEvent | null } {
  const [state, dispatch] = useReducer(applyEvent, null);
  const [sseDown, setSseDown] = useState(false);
  const [lastEvent, setLastEvent] = useState<DashboardEvent | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/events");
    for (const type of DASHBOARD_EVENT_TYPES) {
      es.addEventListener(type, (e) => {
        const event = { type, data: JSON.parse((e as MessageEvent<string>).data) } as DashboardEvent;
        dispatch(event);
        setLastEvent(event);
        setSseDown(false);
      });
    }
    // EventSource reconnects by itself and the server resends `state`.
    es.onerror = () => setSseDown(true);
    return () => es.close();
  }, []);

  return { state, sseDown, lastEvent };
}
