import { useState } from "react";
import type { BoardResult, DashboardProject, DashboardProvider, DashboardThread, LinearIssue, ModelDefaults } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { Button, CardHead, Icon, IconButton, LinearMark, type IconName } from "../../ui/index.ts";
import { NewThreadDialog } from "../new-thread/NewThreadDialog.tsx";
import { daysUntilDue, glance, linkedIdentifiers, type GlanceCounts, type Signal, type SignalKind } from "./glance.ts";

const KINDS: Record<SignalKind, { icon: IconName; label: string }> = {
  mention: { icon: "bell", label: "Mentioned you" },
  "comment-mention": { icon: "messagesSquare", label: "Mentioned you in a comment" },
  assigned: { icon: "user", label: "Assigned to you" },
  urgent: { icon: "alert", label: "Urgent" },
  overdue: { icon: "calendarClock", label: "Overdue" },
  "due-soon": { icon: "calendarClock", label: "Due soon" },
};

function Counter({ label, value, caption, danger }: { label: string; value: number | null; caption?: string; danger?: boolean }) {
  return (
    <div className={`glance-counter${danger ? " danger" : ""}`}>
      <span className="stat-label">{label}</span>
      <span className="glance-value">{value ?? "–"}</span>
      {caption && <span className="stat-caption">{caption}</span>}
    </div>
  );
}

function Counters({ counts }: { counts: GlanceCounts }) {
  return (
    <div className="glance-counters">
      <Counter label="Urgent" value={counts.urgent} />
      <Counter label="Newly assigned" value={counts.assigned} />
      <Counter label="Mentions" value={counts.mentions} />
      <Counter label="Due" value={counts.due} caption={counts.overdue > 0 ? `${counts.overdue} overdue` : undefined} danger={counts.overdue > 0} />
    </div>
  );
}

function when(signal: Signal, now: Date): string {
  if (signal.kind !== "overdue" && signal.kind !== "due-soon") return relativeTime(signal.at, now);
  const days = daysUntilDue(signal.dueDate ?? "", now);
  return days < 0 ? `overdue ${-days} d` : days === 0 ? "due today" : `due in ${days} d`;
}

interface DialogProps {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  modelDefaults: ModelDefaults;
  // addOnly: the agent goes on the Sessions page without leaving the Dashboard.
  onOpen: (id: string, addOnly: boolean) => void;
  onStarted: (issueId: string) => void;
}

interface RowProps {
  signal: Signal;
  now: Date;
  /** The issue to assign, or null when this row offers no agent. */
  assignable: LinearIssue | null;
  onAssign: (issue: LinearIssue) => void;
}

function SignalRow({ signal, now, assignable, onAssign }: RowProps) {
  const kind = KINDS[signal.kind];
  return (
    <div className="glance-row">
      <span className="glance-kind" data-tooltip={kind.label}>
        <Icon name={kind.icon} label={kind.label} />
      </span>
      <a href={signal.url} target="_blank" rel="noreferrer" className="glance-link">
        <span className="ident">{signal.identifier}</span>
        <span className="glance-title">{signal.title}</span>
      </a>
      <span className="glance-meta">{signal.actor ? `${signal.actor} · ${when(signal, now)}` : when(signal, now)}</span>
      <span className="glance-action">
        {assignable && (
          <IconButton label="Assign to an agent" tooltip="Assign to an agent" size="sm" aria-haspopup="dialog" onClick={() => onAssign(assignable)}>
            <Icon name="assignBot" strokeWidth={1.8} />
          </IconButton>
        )}
      </span>
    </div>
  );
}

interface Props extends DialogProps {
  board: BoardResult;
  now: Date;
  loading: boolean;
  threads: DashboardThread[];
  /** Issues just assigned: their thread has not arrived yet. */
  started: ReadonlySet<string>;
  onRefresh: () => void;
}

/** Counters and a short feed of what needs you in Linear. The parent shows it only once Linear is connected. */
export function LinearCard({ board, now, loading, threads, started, onRefresh, projects, providers, modelDefaults, onOpen, onStarted }: Props) {
  // Held here, not in the row: a poll can drop or rekey the row while the dialog is open.
  const [choosing, setChoosing] = useState<LinearIssue | null>(null);
  const { counts, feed } = glance(board, now);
  const linked = linkedIdentifiers(threads);
  const issues = new Map(board.issues.map((i) => [i.id, i]));
  const assignable = (s: Signal) => {
    const found = issues.get(s.issueId);
    return found && !linked.has(found.identifier.toUpperCase()) && !started.has(found.id) ? found : null;
  };
  return (
    <section className="dashboard-card" aria-labelledby="linear-head">
      <CardHead
        id="linear-head"
        icon={<LinearMark />}
        title="Linear"
        actions={
          <>
            <span className="card-updated">Updated {relativeTime(board.readAt, now)}</span>
            <IconButton label="Refresh" tooltip="Refresh data from Linear" size="sm" variant="ghost" aria-busy={loading} disabled={loading} onClick={onRefresh}>
              <Icon name="refresh" className={`icon${loading ? " spinning" : ""}`} />
            </IconButton>
          </>
        }
      />
      {board.ok ? (
        <>
          <Counters counts={counts} />
          {board.inboxError !== null && <p className="glance-note">Inbox not available</p>}
          {feed.length > 0 ? (
            <div className="glance-feed">
              {feed.map((signal) => (
                <SignalRow key={signal.key} signal={signal} now={now} assignable={assignable(signal)} onAssign={setChoosing} />
              ))}
            </div>
          ) : (
            <p className="card-empty">All clear.</p>
          )}
        </>
      ) : (
        <div className="card-empty glance-error">
          <span>Linear could not be read: {board.error}</span>
          <Button size="sm" onClick={onRefresh}>
            Retry
          </Button>
        </div>
      )}
      {choosing && (
        <NewThreadDialog
          issue={choosing}
          projects={projects}
          providers={providers}
          defaults={modelDefaults}
          onClose={() => setChoosing(null)}
          onCreated={(threadId) => {
            setChoosing(null);
            onStarted(choosing.id);
            onOpen(threadId, true);
          }}
        />
      )}
    </section>
  );
}
