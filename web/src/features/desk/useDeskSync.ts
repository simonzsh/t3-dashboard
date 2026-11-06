import { useEffect, useRef, useState, type Dispatch } from "react";
import type { SessionsUpdate, SharedSessions } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { windowsToKeep, type DeskAction, type DeskState } from "./desk.ts";

// Tells our own echo from another device's change.
const ORIGIN = crypto.randomUUID();
const SAVE_DELAY_MS = 200;

// Sorted: a change of order alone stays on this device.
const keyOf = (desk: SharedSessions) => JSON.stringify([...desk.ids].sort());

interface Options {
  desk: DeskState;
  dispatch: Dispatch<DeskAction>;
  /** null until a live state is known, so an offline start does not empty the desk. */
  threads: ReadonlyArray<{ id: string }> | null;
  /** The last `sessions` event from the server. */
  remote: SessionsUpdate | null;
  /** SSE connections so far: a reconnect loads the desk again. */
  connects: number;
}

/** Keeps on the server which windows are on the Desk, so every device shows the same conversations. */
export function useDeskSync({ desk, dispatch, threads, remote, connects }: Options): void {
  const api = useApi();
  const [loaded, setLoaded] = useState(false);
  // The state the server holds as far as we know: what we load, receive or send.
  const known = useRef<string | null>(null);
  const pruned = useRef(false);
  const windows = useRef(desk.windows);
  windows.current = desk.windows;

  const apply = (shared: SharedSessions) => {
    known.current = keyOf(shared);
    dispatch({ type: "sync", ids: shared.ids });
  };

  // A failed load keeps the local desk and never saves: it could overwrite a newer one.
  // The first connection follows the mount load, so only later ones load again.
  const reconnects = Math.max(connects - 1, 0);
  useEffect(() => {
    let cancelled = false;
    api.getDesk().then(
      ({ sessions: saved }) => {
        if (cancelled) return;
        // No saved desk: the save effect below pushes this browser's one, unless it is empty,
        // so a new browser does not win over the one that holds the real desk.
        if (saved) apply(saved);
        else known.current = keyOf({ ids: [] });
        setLoaded(true);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [api, reconnects]);

  useEffect(() => {
    if (loaded && remote && remote.origin !== ORIGIN) apply(remote.sessions);
  }, [remote]);

  const shared: SharedSessions = { ids: desk.windows.map((w) => w.id) };
  const key = keyOf(shared);
  useEffect(() => {
    if (!loaded || key === known.current) return;
    const timer = setTimeout(() => {
      known.current = key;
      api.saveDesk({ sessions: shared, origin: ORIGIN }).catch(() => {});
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded, key]);

  useEffect(() => {
    if (!loaded || !threads || pruned.current) return;
    pruned.current = true;
    const live = new Set(threads.map((t) => t.id));
    const asked = windows.current.map((w) => w.id);
    void windowsToKeep(asked, live, async (id) => (await api.getThread(id)).subagentThread).then((kept) => {
      // A window opened while the server answered is not in `asked`: it stays.
      const opened = windows.current.map((w) => w.id).filter((id) => !asked.includes(id));
      dispatch({ type: "prune", existing: new Set([...kept, ...opened]) });
    });
  }, [loaded, threads, dispatch]);
}
