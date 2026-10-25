import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { waitForRestart } from "./updateFlow.ts";
import { errorMessage } from "../../lib/format.ts";
import { usePoll } from "../../lib/usePoll.ts";

const POLL_MS = 60 * 60 * 1000;

export interface UpdateControl {
  status: UpdateStatus | null;
  updating: boolean;
  checking: boolean;
  error: string | null;
  check(): Promise<void>;
  apply(): Promise<void>;
}

export function useUpdate(): UpdateControl {
  const api = useApi();
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server checks once a day: the page only reads the answer.
  const load = () => api.getUpdate().then(setStatus, () => {});
  useEffect(() => void load(), []);
  usePoll(load, POLL_MS);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setStatus(await api.checkUpdate());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }, []);

  const apply = useCallback(async () => {
    if (!status) return;
    setUpdating(true);
    setError(null);
    try {
      await api.applyUpdate();
      const outcome = await waitForRestart(status.current, {
        health: () => api.getHealth().then((h) => h.version, () => null),
        status: () => api.getUpdate().catch(() => null),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
      });
      if (outcome.kind === "restarted") return location.reload();
      setError(outcome.message);
    } catch (e) {
      setError(errorMessage(e));
    }
    setUpdating(false);
  }, [status]);

  return { status, updating, checking, error, check, apply };
}
