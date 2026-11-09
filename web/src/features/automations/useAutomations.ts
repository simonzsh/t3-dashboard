import { useEffect, useRef, useState } from "react";
import type { AutomationsResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";
import { usePoll } from "../../lib/usePoll.ts";
import { useTurnOn } from "../../lib/useTurnOn.ts";
import { automationsPollMs } from "./automations.ts";

const NEW_THREAD_MS = 2_000;

// Polls while active, faster on its page; it reloads at once on each activation and each return to the page, and soon after a thread it does not know appears (a new run).
export function useAutomations(active: boolean, threadIds: readonly string[] = [], onPage = true): { result: AutomationsResult | null; error: string | null; reload: () => Promise<void> } {
  const api = useApi();
  const notify = useNotify();
  const [result, setResult] = useState<AutomationsResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A reload and a poll can overlap: only the latest request may set the state.
  const seq = useRef(0);
  const load = (): Promise<void> => {
    const id = ++seq.current;
    return api.getAutomations().then(
      (r) => {
        if (id !== seq.current) return;
        setResult(r);
        setError(null);
      },
      (e: unknown) => {
        if (id === seq.current) setError(failure("load the automations", e));
      },
    );
  };
  useEffect(() => {
    if (active) void load();
  }, [active]);
  useTurnOn(onPage, () => active && void load());
  // Once per distinct error: a poll that keeps failing must not reopen a dismissed banner.
  useEffect(() => {
    if (error) notify(error);
  }, [error]);
  // A run thread shows before the next poll: a short debounce marks it as an automation fast.
  const known = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const idsKey = threadIds.join(",");
  useEffect(() => {
    if (!active || !result) return;
    const before = known.current;
    known.current = new Set(threadIds);
    if (before && threadIds.some((id) => !before.has(id))) {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void load(), NEW_THREAD_MS);
    }
  }, [active, result !== null, idsKey]);
  useEffect(() => () => clearTimeout(timer.current), []);
  usePoll(load, active ? automationsPollMs(onPage) : null);

  return { result, error, reload: load };
}
