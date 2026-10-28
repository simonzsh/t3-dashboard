import { useCallback, useState } from "react";
import { browserStorage } from "../../lib/storage.ts";
import { loadHistory, recordOpened, saveHistory } from "./history.ts";

/** Thread ids opened on the Desk, most recent first; localStorage keeps a copy until the server answers. */
export function useOpenHistory(): [readonly string[], (id: string) => void, (ids: readonly string[]) => void] {
  const [ids, setIds] = useState(() => loadHistory(browserStorage()));
  const record = useCallback((id: string) => {
    setIds((prev) => {
      if (prev[0] === id) return prev;
      const next = recordOpened(prev, id);
      saveHistory(browserStorage(), next);
      return next;
    });
  }, []);
  // The server's list replaces ours; the sync hook calls it.
  const replace = useCallback((next: readonly string[]) => {
    setIds([...next]);
    saveHistory(browserStorage(), next);
  }, []);
  return [ids, record, replace];
}
