import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { BoardResult, DashboardProject, DashboardProvider, LinearIssue, ModelDefaults } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { loadAssignProject } from "../../lib/assignProject.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { browserStorage } from "../../lib/storage.ts";
import { tabSelector } from "../../lib/tabs.ts";
import { useAction } from "../../lib/useAction.ts";
import { Button, Icon, IconButton, fly } from "../../ui/index.ts";
import { NewThreadDialog } from "../new-thread/NewThreadDialog.tsx";
import { linearConnected } from "../settings/linearSettings.ts";
import { LinearSetupCard } from "./LinearSetupCard.tsx";
import { PriorityIcon } from "./PriorityIcon.tsx";
import { ticketStart } from "./tickets.ts";

interface RowProps {
  issue: LinearIssue;
  projects: DashboardProject[];
  providers: DashboardProvider[];
  modelDefaults: ModelDefaults;
  // addOnly: the agent goes on the Desk without leaving the Inbox.
  onOpen: (id: string, addOnly: boolean) => void;
  onStarted: (issueId: string) => void;
}

function TicketRow({ issue, projects, providers, modelDefaults, onOpen, onStarted }: RowProps) {
  const api = useApi();
  const { busy, run } = useAction("start the agent");
  const [choosing, setChoosing] = useState(false);
  const row = useRef<HTMLDivElement>(null);
  const saved = loadAssignProject(browserStorage(), issue.team.key, projects);
  const project = projects.find((p) => p.id === saved);

  const started = (threadId: string) => {
    onStarted(issue.id);
    onOpen(threadId, true);
  };
  const start = () => {
    const plan = ticketStart(issue, saved, projects, providers, modelDefaults);
    if (plan.kind === "dialog") return setChoosing(true);
    void run(async () => {
      const { threadId } = await api.assignIssue(plan.body);
      if (row.current) fly(row.current, document.querySelector(tabSelector("desk")));
      started(threadId);
    });
  };

  return (
    <div className="ticket-row" ref={row}>
      <PriorityIcon priority={issue.priority} label={issue.priorityLabel} />
      <span className="ident">{issue.identifier}</span>
      <a href={issue.url} target="_blank" rel="noreferrer" className="ticket-title" data-tooltip={issue.title} data-tooltip-clipped>
        {issue.title}
      </a>
      {project && (
        <span className="project-tag">
          <ProjectIcon icon={project.icon} />
          <span className="project-tag-text">{project.title}</span>
        </span>
      )}
      <Button variant="primary" size="sm" loading={busy} onClick={start}>
        Start
      </Button>
      <IconButton label="Choose project and instructions" tooltip="Choose project and instructions" size="sm" aria-haspopup="dialog" onClick={() => setChoosing(true)}>
        <Icon name="assignBot" strokeWidth={1.8} />
      </IconButton>
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

export function TicketsSection({ board, needsKey, loading, failed, tickets, onRefresh, ...rowProps }: Props) {
  if (!board) return failed ? <p className="empty">Tickets could not be loaded.</p> : null;
  if (!needsKey && tickets.length === 0) return null;
  return (
    <section className="inbox-section" aria-labelledby="inbox-tickets-head">
      <div className="inbox-head">
        <h2 id="inbox-tickets-head" className="inbox-heading">
          Tickets without an agent {tickets.length > 0 && <span className="count">{tickets.length}</span>}
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
      {tickets.map((issue) => (
        <TicketRow key={issue.id} issue={issue} {...rowProps} />
      ))}
    </section>
  );
}
