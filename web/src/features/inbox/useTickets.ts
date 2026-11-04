import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardResult, DashboardThread, LinearIssue } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useNotify } from "../../lib/notices.tsx";
import { useAction } from "../../lib/useAction.ts";
import { boardNeedsKey } from "../settings/linearSettings.ts";
import { ticketsWithoutAgent } from "./tickets.ts";

/** The Linear issues that have no agent yet. `version` changes with the Linear settings: the issues then load again. */
export function useTickets(version: number, threads: DashboardThread[]) {
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
  useEffect(() => {
    void load(version > 0);
  }, [load, version]);

  const needsKey = board !== null && boardNeedsKey(board);
  const linearError = board && !needsKey && !board.ok ? board.error : null;
  useEffect(() => {
    if (linearError) notify(`Linear returned an error: ${linearError}`);
  }, [linearError]);

  const tickets: LinearIssue[] = useMemo(() => ticketsWithoutAgent(board?.issues ?? [], threads).filter((i) => !started.has(i.id)), [board, threads, started]);
  const markStarted = useCallback((id: string) => setStarted((s) => new Set([...s, id])), []);
  return { board, needsKey, loading, failed: error !== null, tickets, reload: load, markStarted };
}
