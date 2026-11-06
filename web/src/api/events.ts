import { useEffect, useReducer, useState } from "react";
import type { DashboardEvent, DashboardState, Diff, SeenState, SessionsUpdate } from "../../../shared/api.ts";
import { DASHBOARD_EVENT_TYPES } from "../../../shared/events.ts";
import { setStash } from "./stashStore.ts";

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
    case "modelDefaults":
      return { ...state, modelDefaults: event.data };
    case "connection":
      return { ...state, connection: event.data };
    case "sessions":
    case "stash":
    case "seen":
      return state;
  }
}

export function useDashboard(): { state: DashboardState | null; sseDown: boolean; remoteSessions: SessionsUpdate | null; remoteSeen: SeenState | null; connects: number } {
  const [state, dispatch] = useReducer(applyEvent, null);
  const [sseDown, setSseDown] = useState(false);
  const [remoteSessions, setRemoteSessions] = useState<SessionsUpdate | null>(null);
  const [remoteSeen, setRemoteSeen] = useState<SeenState | null>(null);
  // A reconnect may have missed `sessions` or `seen` events: the count lets them load again.
  const [connects, setConnects] = useState(0);

  useEffect(() => {
    const es = new EventSource("/api/events");
    for (const type of DASHBOARD_EVENT_TYPES) {
      es.addEventListener(type, (e) => {
        const event = { type, data: JSON.parse((e as MessageEvent<string>).data) } as DashboardEvent;
        if (event.type === "sessions") setRemoteSessions(event.data);
        else if (event.type === "stash") setStash(event.data);
        else if (event.type === "seen") setRemoteSeen(event.data);
        else dispatch(event);
        setSseDown(false);
      });
    }
    // EventSource reconnects by itself and the server resends `state`.
    es.onopen = () => setConnects((n) => n + 1);
    es.onerror = () => setSseDown(true);
    return () => es.close();
  }, []);

  return { state, sseDown, remoteSessions, remoteSeen, connects };
}
