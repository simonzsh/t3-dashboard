import { useEffect, useState, type KeyboardEvent } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { Dialog, Icon, TextInput } from "../../ui/index.ts";
import { mergeResults, moveSelection, titleMatches } from "./search.ts";
import { optionId, SearchResults } from "./SearchResults.tsx";
import { useThreadSearch } from "./useThreadSearch.ts";

interface Props {
  threads: DashboardThread[];
  projects: DashboardProject[];
  now: Date;
  initialQuery: string;
  onOpen: (threadId: string) => void;
  onClose: () => void;
}

export function SearchDialog({ threads, projects, now, initialQuery, onOpen, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [index, setIndex] = useState(0);
  const content = useThreadSearch(query);
  const rows = mergeResults(titleMatches(threads, projects, query), content.matches, threads, projects);
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
    <Dialog title="Search" label="Search conversations" className="search" onClose={onClose}>
      <div className="search-input">
        <Icon name="search" />
        <TextInput
          autoFocus
          role="combobox"
          aria-expanded={rows.length > 0}
          aria-controls="search-list"
          aria-activedescendant={selected ? optionId(selected.thread.id) : undefined}
          aria-label="Search conversations"
          placeholder="Search by title, project or message"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>
      <SearchResults
        rows={rows}
        selected={selectedIndex}
        now={now}
        loading={content.loading}
        error={content.error}
        searched={query.trim().length > 0}
        onSelect={setIndex}
        onOpen={onOpen}
      />
    </Dialog>
  );
}
