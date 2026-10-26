import { relativeTime } from "../../lib/format.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { threadTitle } from "../../lib/threads.ts";
import { Loader, Pressable } from "../../ui/index.ts";
import type { SearchRow } from "./search.ts";

interface Props {
  rows: SearchRow[];
  selected: number;
  now: Date;
  loading: boolean;
  /** Content search failed: the title matches still show. */
  error: string | null;
  searched: boolean;
  onSelect: (index: number) => void;
  onOpen: (threadId: string) => void;
}

export const optionId = (threadId: string) => `search-option-${threadId}`;

export function SearchResults({ rows, selected, now, loading, error, searched, onSelect, onOpen }: Props) {
  return (
    <div className="search-results">
      {rows.length > 0 && (
        <div id="search-list" role="listbox" aria-label="Conversations">
          {rows.map((row, i) => (
            <Pressable
              key={row.thread.id}
              id={optionId(row.thread.id)}
              role="option"
              aria-selected={i === selected}
              tabIndex={-1}
              className={`search-row${i === selected ? " selected" : ""}`}
              onMouseMove={() => i !== selected && onSelect(i)}
              onClick={() => onOpen(row.thread.id)}
            >
              <span className="search-row-head">
                <ProviderIcon provider={row.thread.provider} />
                <span className="search-title">{threadTitle(row.thread)}</span>
                <span className="search-meta">
                  <ProjectIcon icon={row.project.icon} />
                  {row.project.title} · {relativeTime(row.thread.lastActivityAt, now)}
                </span>
              </span>
              {row.snippet && <span className="search-snippet">{row.snippet}</span>}
            </Pressable>
          ))}
        </div>
      )}
      {loading && <Loader />}
      {error && <p className="search-note">Message search failed: {error}</p>}
      {!loading && !error && searched && rows.length === 0 && <p className="search-note">No conversations found.</p>}
    </div>
  );
}
