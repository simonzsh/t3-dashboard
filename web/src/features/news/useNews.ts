import { useEffect, useRef, useState } from "react";
import type { NewsState, SaveNewsBody } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";
import { useAction } from "../../lib/useAction.ts";
import { usePoll } from "../../lib/usePoll.ts";

const POLL_MS = 60_000;

// Polls while active, so a new brief shows without a reload. Save throws: the dialog shows the error.
export function useNews(active: boolean) {
  const api = useApi();
  const notify = useNotify();
  const [state, setState] = useState<NewsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useAction("start the brief");

  // A reload and a poll can overlap: only the latest request may set the state.
  const seq = useRef(0);
  const load = (): Promise<void> => {
    const id = ++seq.current;
    return api.getNews().then(
      (r) => {
        if (id !== seq.current) return;
        setState(r);
        setError(null);
      },
      (e: unknown) => {
        if (id === seq.current) setError(failure("load the news", e));
      },
    );
  };
  useEffect(() => {
    if (active) void load();
  }, [active]);
  // Once per distinct error: a poll that keeps failing must not reopen a dismissed banner.
  useEffect(() => {
    if (error) notify(error);
  }, [error]);
  usePoll(load, active ? POLL_MS : null);

  async function save(body: SaveNewsBody): Promise<void> {
    seq.current++;
    setState(await api.saveNews(body));
  }

  const run = () => running.run(async () => {
    await api.runNews();
    await load();
  });

  return { state, save, run, starting: running.busy };
}
