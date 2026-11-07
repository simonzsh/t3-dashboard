import { Children, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BoardResult, DashboardProject, DashboardProvider, LinearIssue, ModelDefaults } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { Button, CardHead, Icon, IconButton } from "../../ui/index.ts";
import { NewThreadDialog } from "../new-thread/NewThreadDialog.tsx";
import { linearConnected } from "../settings/linearSettings.ts";
import { LinearSetupCard } from "./LinearSetupCard.tsx";
import { SkeletonRows } from "./SkeletonRows.tsx";
import { PriorityIcon } from "./PriorityIcon.tsx";

const UP_NEXT_LIMIT = 5;

/** The tickets: the first rows, then a button for the rest. */
function TicketList({ children }: { children: ReactNode }) {
  const [all, setAll] = useState(false);
  const rows = Children.toArray(children);
  const hidden = all ? 0 : Math.max(rows.length - UP_NEXT_LIMIT, 0);
  return (
    <div className="ticket-list">
      {hidden > 0 ? rows.slice(0, UP_NEXT_LIMIT) : rows}
      {hidden > 0 && (
        <Button variant="ghost" size="sm" className="ticket-more" onClick={() => setAll(true)}>
          Show {hidden} more
        </Button>
      )}
    </div>
  );
}

interface RowProps {
  issue: LinearIssue;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  modelDefaults: ModelDefaults;
  // addOnly: the agent goes on the Sessions page without leaving the Dashboard.
  onOpen: (id: string, addOnly: boolean) => void;
  onStarted: (issueId: string) => void;
}

function TicketRow({ issue, projects, providers, modelDefaults, onOpen, onStarted }: RowProps) {
  const [choosing, setChoosing] = useState(false);
  const { copied, copy } = useCopy("copy the issue link");

  const started = (threadId: string) => {
    onStarted(issue.id);
    onOpen(threadId, true);
  };

  return (
    <div className="ticket-row">
      <span className="ticket-meta">
        <PriorityIcon priority={issue.priority} label={issue.priorityLabel} />
        <span className="ident">{issue.identifier}</span>
      </span>
      <a href={issue.url} target="_blank" rel="noreferrer" className="ticket-title" data-tooltip={issue.title} data-tooltip-clipped>
        {issue.title}
      </a>
      <span className="ticket-foot">
        {issue.project && (
          <span className="ticket-linear-project" data-tooltip={issue.project.name} data-tooltip-clipped>
            {issue.project.name}
          </span>
        )}
        <IconButton label="Copy issue link" tooltip={copied ? "Copied" : "Copy issue link"} size="sm" onClick={() => copy(issue.url)}>
          <Icon name={copied ? "check" : "copy"} />
        </IconButton>
        <IconButton label="Assign to an agent" tooltip="Assign to an agent" size="sm" aria-haspopup="dialog" onClick={() => setChoosing(true)}>
          <Icon name="assignBot" strokeWidth={1.8} />
        </IconButton>
      </span>
      {choosing &&
        createPortal(
          <NewThreadDialog
            issue={issue}
            projects={projects}
            providers={providers}
            defaults={modelDefaults}
            onClose={() => setChoosing(false)}
            onCreated={(threadId) => {
              setChoosing(false);
              started(threadId);
            }}
          />,
          document.body,
        )}
    </div>
  );
}

interface Props extends Omit<RowProps, "issue"> {
  board: BoardResult | null;
  now: Date;
  needsKey: boolean;
  loading: boolean;
  failed: boolean;
  tickets: LinearIssue[];
  /** Threads to relaunch, already rendered as rows. */
  relaunch: ReactNode[];
  onRefresh: () => void;
}

// The Linear connection lives here: its status, refresh and setup card.
export function UpNextCard({ board, now, needsKey, loading, failed, tickets, relaunch, onRefresh, ...rowProps }: Props) {
  const relaunchCount = relaunch.length;
  const empty = board !== null && tickets.length === 0 && relaunchCount === 0 && !needsKey;
  return (
    <section className="dashboard-card" aria-labelledby="up-next-head">
      <CardHead
        id="up-next-head"
        icon="listChecks"
        title="Up next"
        count={tickets.length + relaunchCount}
        actions={
          board && (
            <>
              {linearConnected(board) && (
                <span className="linear-source">
                  <span className="conn-dot" aria-hidden="true" /> Linear
                </span>
              )}
              <span className="card-updated">Updated {relativeTime(board.readAt, now)}</span>
              <IconButton label="Refresh" tooltip="Refresh data from Linear" size="sm" variant="ghost" aria-busy={loading} disabled={loading} onClick={onRefresh}>
                <Icon name="refresh" className={`icon${loading ? " spinning" : ""}`} />
              </IconButton>
            </>
          )
        }
      />
      {board === null && !failed && <SkeletonRows label="Loading up next" rows={3} />}
      {needsKey && board && <LinearSetupCard refused={board.configured} onConnected={onRefresh} />}
      {relaunchCount > 0 && (
        <>
          <h3 className="card-subhead">To relaunch</h3>
          <div className="run-list">{relaunch}</div>
        </>
      )}
      {tickets.length > 0 && (
        <>
          {relaunchCount > 0 && <h3 className="card-subhead">Tickets</h3>}
          <TicketList>
            {tickets.map((issue) => (
              <TicketRow key={issue.id} issue={issue} {...rowProps} />
            ))}
          </TicketList>
        </>
      )}
      {failed && !board && <p className="card-empty">Tickets could not be loaded.</p>}
      {empty && <p className="card-empty">Nothing queued.</p>}
    </section>
  );
}
