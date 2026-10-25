import { useEffect, useReducer, useRef, type Dispatch } from "react";
import { deskReducer, loadDesk, saveDesk, type DeskAction, type DeskState } from "./desk.ts";
import { browserStorage } from "./storage.ts";

// `threads` is null until a live state is known, so an offline start does not empty the desk.
export function useDesk(threads: ReadonlyArray<{ id: string }> | null): [DeskState, Dispatch<DeskAction>] {
  const [desk, dispatch] = useReducer(deskReducer, undefined, () => loadDesk(browserStorage()));
  const pruned = useRef(false);

  useEffect(() => saveDesk(browserStorage(), desk), [desk]);

  useEffect(() => {
    if (!threads || pruned.current) return;
    pruned.current = true;
    dispatch({ type: "prune", existing: new Set(threads.map((t) => t.id)) });
  }, [threads]);

  return [desk, dispatch];
}
