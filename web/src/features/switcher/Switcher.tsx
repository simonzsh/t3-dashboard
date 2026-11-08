import { useEffect, useState } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { Dialog, SearchField, useListNav } from "../../ui/index.ts";
import { mergeResults, suggestThreads, titleMatches } from "./switcher.ts";
import { optionId, SwitcherResults } from "./SwitcherResults.tsx";
import { useNotify } from "../../lib/notices.tsx";
import { useThreadSearch } from "./useThreadSearch.ts";

interface Props {
  threads: DashboardThread[];
  projects: DashboardProject[];
  now: Date;
  history: readonly string[];
  /** Threads already in a visible Sessions window: not worth suggesting. */
  inSessions: ReadonlySet<string>;
  initialQuery: string;
  onOpen: (threadId: string) => void;
  onClose: () => void;
}

export function Switcher({ threads, projects, now, history, inSessions, initialQuery, onOpen, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const content = useThreadSearch(query);
  const notify = useNotify();
  useEffect(() => {
    if (content.error) notify(content.error);
  }, [content.error]);
  const suggesting = query.trim() === "";
  const rows = suggesting ? suggestThreads(threads, projects, history, inSessions) : mergeResults(titleMatches(threads, projects, query), content.matches, threads, projects);
  const nav = useListNav(rows.length, { initial: 0, homeEnd: false, onPick: (i) => onOpen(rows[i]!.thread.id), itemId: (i) => optionId(rows[i]!.thread.id) });
  const selected = rows[nav.active];

  return (
    <Dialog title="Jump to" label="Jump to a conversation" className="switcher" onClose={onClose}>
      <SearchField
        className="switcher-input"
        autoFocus
        role="combobox"
        aria-expanded={rows.length > 0}
        aria-controls="switcher-list"
        aria-activedescendant={selected ? optionId(selected.thread.id) : undefined}
        aria-label="Jump to a conversation"
        placeholder="Jump to a conversation…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          nav.setActive(0);
        }}
        onKeyDown={nav.onKeyDown}
      />
      <SwitcherResults
        rows={rows}
        active={nav.active}
        now={now}
        loading={content.loading}
        error={content.error}
        label={suggesting ? "Suggested" : undefined}
        searched={!suggesting}
        query={query}
        onHover={nav.hover}
        onOpen={onOpen}
      />
    </Dialog>
  );
}
