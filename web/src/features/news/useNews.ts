import { useEffect, useRef, useState } from "react";
import type { NewsState, SaveNewsBody } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { useNotify } from "../../lib/notices.tsx";
import { useAction } from "../../lib/useAction.ts";
import { usePoll } from "../../lib/usePoll.ts";
import { isStarting, pollInterval, STARTING_MS } from "./news.ts";

// Polls all the time (slowly off the page), so a new article shows and the tab badge counts without a reload. `active`: the News page is open.
// Save throws: the dialog shows the error.
export function useNews(active: boolean) {
  const api = useApi();
  const notify = useNotify();
  const [state, setState] = useState<NewsState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useAction("start the news run");

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
  // Opening the page refreshes at once; the first load happens on mount. Leaving it loads nothing.
  const first = useRef(true);
  useEffect(() => {
    if (active || first.current) void load();
    first.current = false;
  }, [active]);
  // Once per distinct error, and only on the page: a poll that keeps failing must not reopen a dismissed banner.
  useEffect(() => {
    if (error && active) notify(error);
  }, [error, active]);
  // Run now was just pressed: show the run before the server sees its thread. Ends when the server shows the run, a newer article exists or 2 minutes pass.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const serverRunning = state?.running != null;
  const newest = state?.articles[0]?.mtimeMs ?? null;
  useEffect(() => {
    if (startedAt === null) return;
    if (serverRunning || !isStarting(startedAt, Date.now(), newest)) {
      setStartedAt(null);
      return;
    }
    const timer = setTimeout(() => setStartedAt(null), Math.max(0, startedAt + STARTING_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [startedAt, serverRunning, newest]);
  const writing = serverRunning || startedAt !== null;
  // Fast only while the page shows the run.
  usePoll(load, pollInterval(writing && active));

  async function save(body: SaveNewsBody): Promise<void> {
    seq.current++;
    setState(await api.saveNews(body));
  }

  const run = () => running.run(async () => {
    await api.runNews();
    setStartedAt(Date.now());
    await load();
  });

  // Throws: the confirm dialog shows the error. The list reloads even when the delete fails half way.
  async function remove(date: string): Promise<void> {
    try {
      await api.deleteNewsArticle(date);
    } finally {
      await load();
    }
  }
  async function removeAll(): Promise<void> {
    try {
      await api.deleteAllNews();
    } finally {
      await load();
    }
  }

  return { state, save, run, remove, removeAll, starting: running.busy, writing };
}
