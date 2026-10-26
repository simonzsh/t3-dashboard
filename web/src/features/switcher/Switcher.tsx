import { useEffect, useState, type KeyboardEvent } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { Dialog, Icon, TextInput } from "../../ui/index.ts";
import { mergeResults, moveSelection, suggestThreads, titleMatches } from "./switcher.ts";
import { optionId, SwitcherResults } from "./SwitcherResults.tsx";
import { useThreadSearch } from "./useThreadSearch.ts";

interface Props {
  threads: DashboardThread[];
  projects: DashboardProject[];
  now: Date;
  history: readonly string[];
  /** Threads already in a visible Desk window: not worth suggesting. */
  onDesk: ReadonlySet<string>;
  initialQuery: string;
  onOpen: (threadId: string) => void;
  onClose: () => void;
}

export function Switcher({ threads, projects, now, history, onDesk, initialQuery, onOpen, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(0);
  const content = useThreadSearch(query);
  const suggesting = query.trim() === "";
  const rows = suggesting ? suggestThreads(threads, projects, history, onDesk) : mergeResults(titleMatches(threads, projects, query), content.matches, threads, projects);
  const selectedIndex = Math.min(index, rows.length - 1);
  const selected = rows[selectedIndex];

  useEffect(() => {
    if (selected) document.getElementById(optionId(selected.thread.id))?.scrollIntoView({ block: "nearest" });
  }, [selected?.thread.id]);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setIndex(moveSelection(selectedIndex, e.key === "ArrowDown" ? 1 : -1, rows.length));
    } else if (e.key === "Enter" && selected) {
      e.preventDefault();
      onOpen(selected.thread.id);
    }
  }

  return (
    <Dialog title="Jump to" label="Jump to a conversation" className="switcher" onClose={onClose}>
      <div className="switcher-input">
        <Icon name="search" />
        <TextInput
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
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <SwitcherResults
        rows={rows}
        selected={selectedIndex}
        now={now}
        loading={content.loading}
        error={content.error}
        label={suggesting ? "Suggested" : undefined}
        searched={!suggesting}
        onSelect={setIndex}
        onOpen={onOpen}
      />
    </Dialog>
  );
}
