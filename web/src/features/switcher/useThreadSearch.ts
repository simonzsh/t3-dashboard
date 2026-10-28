import { useEffect, useState } from "react";
import type { ThreadSearchMatch } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { failure } from "../../lib/format.ts";
import { useDebouncedValue } from "../../lib/useDebouncedValue.ts";
import { shouldSearchContent } from "./switcher.ts";

const DEBOUNCE_MS = 200;

interface Search {
  matches: ThreadSearchMatch[];
  loading: boolean;
  error: string | null;
}

export function useThreadSearch(query: string): Search {
  const api = useApi();
  const q = useDebouncedValue(query.trim(), DEBOUNCE_MS);
  const [result, setResult] = useState<{ q: string; matches: ThreadSearchMatch[]; error: string | null } | null>(null);
  const active = shouldSearchContent(q);

  useEffect(() => {
    if (!active) return;
    // A newer query makes this answer stale.
    let stale = false;
    api
      .searchThreads(q)
      .then((r) => !stale && setResult({ q, matches: r.matches, error: null }))
      .catch((e: unknown) => !stale && setResult({ q, matches: [], error: failure("search the messages", e) }));
    return () => {
      stale = true;
    };
  }, [api, q, active]);

  // While the debounce runs, the last answer belongs to another query: hide it.
  const typing = query.trim() !== q;
  const current = active && !typing && result?.q === q ? result : null;
  return { matches: current?.matches ?? [], loading: shouldSearchContent(query) && (typing || (active && current === null)), error: current?.error ?? null };
}
