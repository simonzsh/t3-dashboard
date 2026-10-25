import { useCallback, useEffect, useState } from "react";
import type { UpdateStatus } from "../../shared/api.ts";
import { api } from "./api.ts";
import { waitForRestart } from "./updateFlow.ts";

const POLL_MS = 60 * 60 * 1000;

export interface UpdateControl {
  status: UpdateStatus | null;
  updating: boolean;
  checking: boolean;
  error: string | null;
  check(): Promise<void>;
  apply(): Promise<void>;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useUpdate(): UpdateControl {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [updating, setUpdating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The server checks once a day: the page only reads the answer.
  useEffect(() => {
    const load = () => api.getUpdate().then(setStatus, () => {});
    void load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    setError(null);
    try {
      setStatus(await api.checkUpdate());
    } catch (e) {
      setError(messageOf(e));
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
      setError(messageOf(e));
    }
    setUpdating(false);
  }, [status]);

  return { status, updating, checking, error, check, apply };
}
