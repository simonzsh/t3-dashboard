import { useEffect, useRef, useState, type Dispatch } from "react";
import type { DeskUpdate, SharedDesk } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import type { DeskAction, DeskState } from "./desk.ts";

// Tells our own echo from another device's change.
const ORIGIN = crypto.randomUUID();
const SAVE_DELAY_MS = 200;

const keyOf = (desk: SharedDesk) => JSON.stringify(desk);

interface Options {
  desk: DeskState;
  dispatch: Dispatch<DeskAction>;
  history: readonly string[];
  replaceHistory: (ids: readonly string[]) => void;
  /** null until a live state is known, so an offline start does not empty the desk. */
  threads: ReadonlyArray<{ id: string }> | null;
  /** The last `desk` event from the server. */
  remote: DeskUpdate | null;
  /** SSE connections so far: a reconnect loads the desk again. */
  connects: number;
}

/** Keeps the windows and the history on the server, so every device shows the same Desk. */
export function useDeskSync({ desk, dispatch, history, replaceHistory, threads, remote, connects }: Options): void {
  const api = useApi();
  const [loaded, setLoaded] = useState(false);
  // The state the server holds as far as we know: what we load, receive or send.
  const known = useRef<string | null>(null);
  const pruned = useRef(false);

  const apply = (shared: SharedDesk) => {
    known.current = keyOf(shared);
    dispatch({ type: "sync", windows: shared.windows });
    replaceHistory(shared.history);
  };

  // A failed load keeps the local desk and never saves: it could overwrite a newer one.
  // The first connection follows the mount load, so only later ones load again.
  const reconnects = Math.max(connects - 1, 0);
  useEffect(() => {
    let cancelled = false;
    api.getDesk().then(
      ({ desk: saved }) => {
        if (cancelled) return;
        // No saved desk: the save effect below pushes this browser's one, unless it is empty,
        // so a new browser does not win over the one that holds the real desk.
        if (saved) apply(saved);
        else known.current = keyOf({ windows: [], history: [] });
        setLoaded(true);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [api, reconnects]);

  useEffect(() => {
    if (loaded && remote && remote.origin !== ORIGIN) apply(remote.desk);
  }, [remote]);

  const shared: SharedDesk = { windows: desk.windows, history: [...history] };
  const key = keyOf(shared);
  useEffect(() => {
    if (!loaded || key === known.current) return;
    const timer = setTimeout(() => {
      known.current = key;
      api.saveDesk({ desk: shared, origin: ORIGIN }).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded, key]);

  useEffect(() => {
    if (!loaded || !threads || pruned.current) return;
    pruned.current = true;
    dispatch({ type: "prune", existing: new Set(threads.map((t) => t.id)) });
  }, [loaded, threads, dispatch]);
}
