import { useState } from "react";

/** A refresh action and its busy flag: the flag stays on until the load settles, even when it fails. */
export function useRefresh(load: () => Promise<void>): { refreshing: boolean; refresh: () => Promise<void> } {
  const [refreshing, setRefreshing] = useState(false);
  async function refresh(): Promise<void> {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }
  return { refreshing, refresh };
}
