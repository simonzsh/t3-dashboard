import { useCallback, useEffect, useRef, useState } from "react";
import type { BoardResult } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { useNotify } from "../../lib/notices.tsx";
import { useAction } from "../../lib/useAction.ts";
import { usePoll } from "../../lib/usePoll.ts";
import { boardNeedsKey } from "../settings/linearSettings.ts";
import { linearCardShown } from "./glance.ts";

// Linear changes without notice: items read there leave the card at the next read.
const POLL_MS = 120_000;
// Survives the Dashboard unmount on tab change: a known-connected card shows at once, with no layout jump.
let lastBoard: BoardResult | null = null;

/**
 * The Linear board. It loads while the card is not hidden, even before the card shows, to learn whether Linear is connected.
 * `version` changes with the Linear settings: the board then loads again.
 */
export function useLinear(version: number, enabled: boolean) {
  const api = useApi();
  const notify = useNotify();
  const [board, setBoard] = useState<BoardResult | null>(lastBoard);
  // Issues just started: no assign button until their thread arrives over the event stream.
  const [started, setStarted] = useState<ReadonlySet<string>>(new Set());
  const { busy: loading, run } = useAction("load Linear");

  const load = useCallback(
    (refresh: boolean) =>
      run(async () => {
        lastBoard = await api.getBoard(refresh);
        setBoard(lastBoard);
        setStarted(new Set());
      }),
    [],
  );
  // Bypass the server cache only for a settings change, not on each visit to the Dashboard.
  const loadedVersion = useRef(version);
  useEffect(() => {
    if (!enabled) return;
    void load(version !== loadedVersion.current);
    loadedVersion.current = version;
  }, [load, version, enabled]);
  usePoll(() => load(false), enabled ? POLL_MS : null);

  const linearError = board && !boardNeedsKey(board) && !board.ok ? board.error : null;
  useEffect(() => {
    if (linearError) notify(`Linear returned an error: ${linearError}`);
  }, [linearError]);

  const markStarted = useCallback((id: string) => setStarted((s) => new Set([...s, id])), []);
  return { board, shown: linearCardShown(board), loading, reload: load, markStarted, started };
}
