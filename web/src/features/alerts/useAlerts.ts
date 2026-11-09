import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AlertsState } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useAction } from "../../lib/useAction.ts";
import { alertClickUrl } from "./alerts.ts";

interface Options {
  /** The last `alerts` event from the server. */
  remote: AlertsState | null;
  /** SSE connections so far: a reconnect loads the alerts again. */
  connects: number;
}

/** Whether alerts are set up and which sessions are armed. The server holds both, shared by every device. */
export function useAlerts({ remote, connects }: Options) {
  const api = useApi();
  const [state, setState] = useState<AlertsState | null>(null);
  const action = useAction("change the alert");
  const latest = useRef(state);
  latest.current = state;

  const load = useCallback(() => api.getAlerts().then(setState, () => {}), [api]);
  // The first connection follows the mount load, so only later ones load again.
  const reconnects = Math.max(connects - 1, 0);
  useEffect(() => {
    void load();
  }, [load, reconnects]);

  useEffect(() => {
    if (remote) setState(remote);
  }, [remote]);

  // A refused change (alerts turned off elsewhere, say) leaves the bell wrong: load the truth again.
  const toggle = useCallback(
    (id: string) => {
      const armed = latest.current?.armed.includes(id);
      void action
        .run(async () => setState(armed ? await api.disarmAlert(id) : await api.armAlert(id, alertClickUrl(location, id))))
        .then((ok) => {
          if (!ok) void load();
        });
    },
    [api, load],
  );

  const armed = useMemo(() => new Set(state?.armed), [state]);
  return { configured: state?.configured ?? false, armed, toggle };
}
