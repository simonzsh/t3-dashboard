import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BoardResult, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useNotify } from "../../lib/notices.tsx";
import { useAction } from "../../lib/useAction.ts";
import { boardNeedsKey } from "../settings/linearSettings.ts";
import { planTickets } from "./tickets.ts";

/** The Linear tickets to relaunch or do next. `version` changes with the Linear settings: the issues then load again. */
export function useTickets(version: number, threads: DashboardThread[], seen: SeenState, now: Date) {
  const api = useApi();
  const notify = useNotify();
  const [board, setBoard] = useState<BoardResult | null>(null);
  // Issues just started: hidden until their thread arrives over the event stream.
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set());
  const { busy: loading, error, run } = useAction("load the tickets");

  const load = useCallback(
    (refresh: boolean) =>
      run(async () => {
        setBoard(await api.getBoard(refresh));
        setStarted(new Set());
      }),
    [],
  );
  // Bypass the server cache only for a settings change, not on each visit to the Dashboard.
  const loadedVersion = useRef(version);
  useEffect(() => {
    void load(version !== loadedVersion.current);
    loadedVersion.current = version;
  }, [load, version]);

  const needsKey = board !== null && boardNeedsKey(board);
  const linearError = board && !needsKey && !board.ok ? board.error : null;
  useEffect(() => {
    if (linearError) notify(`Linear returned an error: ${linearError}`);
  }, [linearError]);

  const plan = useMemo(() => planTickets((board?.issues ?? []).filter((i) => !started.has(i.id)), threads, seen, now), [board, threads, started, seen, now]);
  const markStarted = useCallback((id: string) => setStarted((s) => new Set([...s, id])), []);
  return { board, needsKey, loading, failed: error !== null, plan, reload: load, markStarted };
}
