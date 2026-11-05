import { useState } from "react";
import { createPortal } from "react-dom";
import type { BoardResult, DashboardProject, DashboardProvider, LinearIssue, ModelDefaults } from "../../../../shared/api.ts";
import { loadAssignProject } from "../../lib/assignProject.ts";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { Icon, IconButton } from "../../ui/index.ts";
import { NewThreadDialog } from "../new-thread/NewThreadDialog.tsx";
import { linearConnected } from "../settings/linearSettings.ts";
import { CappedList } from "./InboxSection.tsx";
import { LinearSetupCard } from "./LinearSetupCard.tsx";
import { PriorityIcon } from "./PriorityIcon.tsx";

const UP_NEXT_LIMIT = 5;

export interface RowProps {
  issue: LinearIssue;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  modelDefaults: ModelDefaults;
  // addOnly: the agent goes on the Desk without leaving the Inbox.
  onOpen: (id: string, addOnly: boolean) => void;
  onStarted: (issueId: string) => void;
}

export function TicketRow({ issue, projects, providers, modelDefaults, onOpen, onStarted }: RowProps) {
  const [choosing, setChoosing] = useState(false);
  const { copied, copy } = useCopy("copy the issue link");
  const saved = loadAssignProject(browserStorage(), issue.team.key, projects);
  const project = projects.find((p) => p.id === saved);

  const started = (threadId: string) => {
    onStarted(issue.id);
    onOpen(threadId, true);
  };

  return (
    <div className="ticket-row">
      <span className="ticket-meta">
        <PriorityIcon priority={issue.priority} label={issue.priorityLabel} />
        <span className="ident">{issue.identifier}</span>
        {project && <ProjectTag icon={project.icon} title={project.title} />}
      </span>
      <a href={issue.url} target="_blank" rel="noreferrer" className="ticket-title" data-tooltip={issue.title} data-tooltip-clipped>
        {issue.title}
      </a>
      <span className="ticket-actions">
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
  needsKey: boolean;
  loading: boolean;
  failed: boolean;
  tickets: LinearIssue[];
  onRefresh: () => void;
}

// The Linear connection lives here: its status, refresh and setup card.
export function UpNextSection({ board, needsKey, loading, failed, tickets, onRefresh, ...rowProps }: Props) {
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
          <TicketRow key={issue.id} issue={issue} {...rowProps} />
        ))}
      </CappedList>
    </section>
  );
}
