import { useCallback, useState } from "react";
import { browserStorage } from "../../lib/storage.ts";
import { loadHistory, recordOpened, saveHistory } from "./history.ts";

/** Thread ids opened on the Desk, most recent first, kept in localStorage. */
export function useOpenHistory(): [readonly string[], (id: string) => void] {
  const [ids, setIds] = useState(() => loadHistory(browserStorage()));
  const record = useCallback((id: string) => {
    setIds((prev) => {
      const next = recordOpened(prev, id);
      saveHistory(browserStorage(), next);
      return next;
    });
  }, []);
  return [ids, record];
}
