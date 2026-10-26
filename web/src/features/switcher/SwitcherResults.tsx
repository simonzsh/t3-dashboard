import { relativeTime } from "../../lib/format.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { threadTitle } from "../../lib/threads.ts";
import { Loader, Pressable } from "../../ui/index.ts";
import type { SwitcherRow } from "./switcher.ts";

interface Props {
  rows: SwitcherRow[];
  selected: number;
  now: Date;
  loading: boolean;
  /** Content search failed: the title matches still show. */
  error: string | null;
  /** Small heading above the list. */
  label?: string;
  searched: boolean;
  onSelect: (index: number) => void;
  onOpen: (threadId: string) => void;
}

export const optionId = (threadId: string) => `switcher-option-${threadId}`;

export function SwitcherResults({ rows, selected, now, loading, error, label, searched, onSelect, onOpen }: Props) {
  return (
    <div className="switcher-results">
      {rows.length > 0 && label && <p className="switcher-label">{label}</p>}
      {rows.length > 0 && (
        <div id="switcher-list" role="listbox" aria-label="Conversations">
          {rows.map((row, i) => (
            <Pressable
              key={row.thread.id}
              id={optionId(row.thread.id)}
              role="option"
              aria-selected={i === selected}
              tabIndex={-1}
              className={`switcher-row${i === selected ? " selected" : ""}`}
              onMouseMove={() => i !== selected && onSelect(i)}
              onClick={() => onOpen(row.thread.id)}
            >
              <span className="switcher-row-head">
                <ProviderIcon provider={row.thread.provider} />
                <span className="switcher-title">{threadTitle(row.thread)}</span>
                <span className="switcher-meta">
                  <ProjectIcon icon={row.project.icon} />
                  {row.project.title} · {relativeTime(row.thread.lastActivityAt, now)}
                </span>
              </span>
              {row.snippet && <span className="switcher-snippet">{row.snippet}</span>}
            </Pressable>
          ))}
        </div>
      )}
      {loading && <Loader />}
      {error && <p className="switcher-note">Message search failed: {error}</p>}
      {!loading && !error && searched && rows.length === 0 && <p className="switcher-note">No conversations found.</p>}
    </div>
  );
}
