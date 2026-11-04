import type { BoardResult, LinearIssue } from "../../../../shared/api.ts";
import { Icon, IconButton } from "../../ui/index.ts";
import { linearConnected } from "../settings/linearSettings.ts";
import { CappedList } from "./InboxSection.tsx";
import { LinearSetupCard } from "./LinearSetupCard.tsx";
import { PriorityIcon } from "./PriorityIcon.tsx";

const UP_NEXT_LIMIT = 5;

function TicketRow({ issue }: { issue: LinearIssue }) {
  return (
    <div className="ticket-row">
      <span className="ticket-meta">
        <PriorityIcon priority={issue.priority} label={issue.priorityLabel} />
        <span className="ident">{issue.identifier}</span>
      </span>
      <a href={issue.url} target="_blank" rel="noreferrer" className="ticket-title" data-tooltip={issue.title} data-tooltip-clipped>
        {issue.title}
      </a>
    </div>
  );
}

interface Props {
  board: BoardResult | null;
  needsKey: boolean;
  loading: boolean;
  failed: boolean;
  tickets: LinearIssue[];
  onRefresh: () => void;
}

// The Linear connection lives here: its status, refresh and setup card.
export function UpNextSection({ board, needsKey, loading, failed, tickets, onRefresh }: Props) {
  if (!board) return failed ? <p className="empty">Tickets could not be loaded.</p> : null;
  if (!needsKey && tickets.length === 0) return null;
  return (
    <section className="inbox-section" aria-labelledby="inbox-up-next-head">
      <div className="inbox-head">
        <h2 id="inbox-up-next-head" className="inbox-heading">
          Up next {tickets.length > 0 && <span className="count">{tickets.length}</span>}
        </h2>
        {linearConnected(board) && (
          <span className="linear-source">
            <span className="conn-dot" aria-hidden="true" /> Connected to Linear
          </span>
        )}
        <IconButton label="Refresh" tooltip="Refresh data from Linear" size="sm" variant="ghost" aria-busy={loading} disabled={loading} onClick={onRefresh}>
          <Icon name="refresh" className={`icon${loading ? " spinning" : ""}`} />
        </IconButton>
      </div>
      {needsKey && <LinearSetupCard refused={board.configured} onConnected={onRefresh} />}
      <CappedList limit={UP_NEXT_LIMIT}>
        {tickets.map((issue) => (
          <TicketRow key={issue.id} issue={issue} />
        ))}
      </CappedList>
    </section>
  );
}
