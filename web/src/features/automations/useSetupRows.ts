import { useEffect, useMemo, useRef, useState } from "react";
import type { DashboardState } from "../../../../shared/api.ts";
import { finishedSetups, setupThreads } from "./automations.ts";

/** Setup rows, plus the ones that just finished: they stay listed until a fresh list says where they go. */
export function useSetupRows(threads: DashboardState["threads"], setupIds: readonly string[], reload: () => Promise<void>) {
  const active = useMemo(() => setupThreads(threads, setupIds), [threads, setupIds]);
  const wasActive = useRef<ReadonlySet<string>>(new Set());
  const [settling, setSettling] = useState<ReadonlySet<string>>(new Set());
  const key = active.map((t) => t.id).join(",");
  useEffect(() => {
    const done = finishedSetups(wasActive.current, active);
    wasActive.current = new Set(active.map((t) => t.id));
    if (done.length === 0) return;
    setSettling((s) => new Set([...s, ...done]));
    const clear = () => setSettling((s) => new Set([...s].filter((id) => !done.includes(id))));
    void reload().then(clear, clear);
  }, [key]);
  return useMemo(() => [...active, ...threads.filter((t) => settling.has(t.id) && !active.includes(t))], [active, threads, settling]);
}
