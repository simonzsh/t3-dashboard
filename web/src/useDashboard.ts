import { useEffect, useReducer, useState } from "react";
import type { DashboardEvent, DashboardState } from "../../shared/api.ts";
import { DASHBOARD_EVENT_TYPES } from "../../shared/events.ts";
import { applyEvent } from "./state.ts";

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
