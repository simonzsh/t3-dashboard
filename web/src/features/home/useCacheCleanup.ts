import { useCallback, useState } from "react";
import type { CacheCleanupPreview } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { cleanupSummary } from "./serverView.ts";

// The sizes are read when the dialog opens: a scan of the caches is too slow to poll.
export function useCacheCleanup(onCleaned: () => void) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<CacheCleanupPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);

  const start = useCallback(() => {
    setOpen(true);
    setPreview(null);
    setError(null);
    setSummary(null);
    api.getCacheCleanup().then(setPreview, (e) => setError(failure("measure the caches", e)));
  }, [api]);

  const close = useCallback(() => setOpen(false), []);

  const confirm = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      setSummary(cleanupSummary(await api.clearCaches()));
      setOpen(false);
      onCleaned();
    } catch (e) {
      setError(failure("clear the caches", e));
    } finally {
      setRunning(false);
    }
  }, [api, onCleaned]);

  return { open, preview, error, running, summary, start, close, confirm };
}
