import { relativeTime } from "../../lib/format.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { threadTitle } from "../../lib/threads.ts";
import { Loader, OptionList } from "../../ui/index.ts";
import { highlightParts, type SwitcherRow } from "./switcher.ts";

interface Props {
  rows: SwitcherRow[];
  /** Row picked by the arrow keys or the pointer. */
  active: number;
  now: Date;
  loading: boolean;
  /** Content search failed: the title matches still show. */
  error: string | null;
  /** Small heading above the list. */
  label?: string;
  searched: boolean;
  /** Typed text, highlighted in titles and snippets. */
  query: string;
  onHover: (index: number) => void;
  onOpen: (threadId: string) => void;
}

export const optionId = (threadId: string) => `switcher-option-${threadId}`;

export function SwitcherResults({ rows, active, now, loading, error, label, searched, query, onHover, onOpen }: Props) {
  return (
    <div className="switcher-results">
      {rows.length > 0 && label && <p className="switcher-label">{label}</p>}
      {rows.length > 0 && (
        <OptionList
          id="switcher-list"
          label="Conversations"
          items={rows}
          active={active}
          itemId={(i) => optionId(rows[i]!.thread.id)}
          itemKey={(row) => row.thread.id}
          optionClassName="switcher-row"
          onHover={onHover}
          onPick={(row) => onOpen(row.thread.id)}
        >
          {(row) => (
            <>
              <span className="switcher-row-head">
                <ProviderIcon provider={row.thread.provider} />
                <span className="switcher-title">
                  <Highlight text={threadTitle(row.thread)} query={query} />
                </span>
                <AutomationMark id={row.thread.id} />
                <span className="switcher-meta">
                  <ProjectIcon icon={row.project.icon} title={row.project.title} />
                  {row.project.title} · {relativeTime(row.thread.lastActivityAt, now)}
                </span>
              </span>
              {row.snippet && (
                <span className="switcher-snippet">
                  <Highlight text={row.snippet} query={query} />
                </span>
              )}
            </>
          )}
        </OptionList>
      )}
      {loading && <Loader />}
      {!loading && !error && searched && rows.length === 0 && <p className="switcher-note">No conversations found.</p>}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  return highlightParts(text, query).map((part, i) => (part.match ? <mark key={i}>{part.text}</mark> : part.text));
}
