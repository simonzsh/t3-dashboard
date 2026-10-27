import type { Automation, AutomationsResult, DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { isFinishedReminder, lastRunState, nextLabel, reminderDate, splitAutomations } from "./automations.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { useState } from "react";
import { Badge, Icon, IconButton, Loader, Pressable } from "../../ui/index.ts";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog.tsx";
import { RenameAutomationDialog } from "./RenameAutomationDialog.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { StatusBadge } from "./StatusBadge.tsx";

interface Props {
  result: AutomationsResult | null;
  error: string | null;
  threads: DashboardThread[];
  projects: DashboardProject[];
  /** Threads whose agent is still setting a task up. */
  setup: DashboardThread[];
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
  onDeleted: () => void;
  onRenamed: () => void;
}

interface RowProps {
  a: Automation;
  thread: DashboardThread | undefined;
  project: DashboardProject | undefined;
  now: Date;
  onOpen: (id: string, addOnly: boolean) => void;
  onRename: (a: Automation) => void;
  onDelete: (a: Automation) => void;
}

function Row({ a, thread, project, now, onOpen, onRename, onDelete }: RowProps) {
  const last = lastRunState(a, thread);
  const finished = isFinishedReminder(a);
  const reminderAt = finished ? a.lastRunAt : a.nextRunAt;
  const when = a.kind === "reminder" ? (reminderAt ? reminderDate(reminderAt) : "") : a.scheduleLabel;
  const sub = [a.project, when].filter(Boolean).join(" · ");
  const body = (
    <>
      <span className="auto-title">{a.title}</span>
      <span className="auto-side">
        {!finished && <span className="auto-next">{a.enabled ? nextLabel(a.nextRunAt, now) : "paused"}</span>}
        {last?.kind === "waiting" && <Badge variant="waiting">Waiting</Badge>}
        {last?.kind === "running" && (
          <Badge variant="running">
            <span className="pulse" aria-hidden="true" />
            Running
          </Badge>
        )}
        {last?.kind === "failed" && (
          <span data-tooltip={last.error ?? "The last run failed"}>
            <Badge variant="error">Error</Badge>
          </span>
        )}
        {last?.kind === "done" && <Badge variant="done">Finished {last.at}</Badge>}
      </span>
      <span className="auto-sub">
        <ProjectIcon icon={project?.icon ?? null} />
        <span className="auto-sub-text">{sub}</span>
      </span>
    </>
  );
  const { threadId } = a;
  return (
    <li className="auto-item">
      {threadId ? (
        <Pressable className={`auto-row auto-grid${last ? ` ${last.kind}` : ""}`} onClick={(e) => onOpen(threadId, e.shiftKey)}>
          {body}
        </Pressable>
      ) : (
        <div className="auto-row auto-grid">{body}</div>
      )}
      <IconButton label="Rename automation" size="sm" variant="ghost" className="auto-rename" onClick={() => onRename(a)}>
        <Icon name="edit" />
      </IconButton>
      <IconButton label="Delete automation" size="sm" variant="ghost" className="auto-delete" onClick={() => onDelete(a)}>
        <Icon name="trash" />
      </IconButton>
    </li>
  );
}

function SetupRow({ thread, onOpen }: { thread: DashboardThread; onOpen: (id: string, addOnly: boolean) => void }) {
  const status = agentStatus(thread);
  return (
    <li>
      <Pressable className={`auto-row ${status === "working" ? "running" : status}`} onClick={(e) => onOpen(thread.id, e.shiftKey)}>
        <span className="auto-main">
          <span className="auto-title">{thread.title}</span>
          <span className="auto-sub">Setting up</span>
        </span>
        <span className="auto-side">
          <StatusBadge thread={thread} status={status} />
        </span>
      </Pressable>
    </li>
  );
}

export function AutomationsColumn({ result, error, threads, projects, setup, now, onOpen, onDeleted, onRenamed }: Props) {
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [renaming, setRenaming] = useState<Automation | null>(null);
  const byId = new Map(threads.map((t) => [t.id, t]));
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const { routines, reminders } = splitAutomations(result?.automations ?? []);
  const section = (title: string, rows: Automation[], empty: string) => (
    <section className="group">
      <h2>
        {title} <span className="count">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="empty auto-empty">{empty}</p>
      ) : (
        <ul className="auto-list">
          {rows.map((a) => (
            <Row key={a.id} a={a} thread={a.threadId ? byId.get(a.threadId) : undefined} project={projectById.get(a.projectId)} now={now} onOpen={onOpen} onRename={setRenaming} onDelete={setDeleting} />
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <aside className="automations" aria-label="Automations">
      <div className="auto-head">
        <h2 className="auto-heading">Automations</h2>
      </div>
      {setup.length > 0 && (
        <ul className="auto-list">
          {setup.map((t) => (
            <SetupRow key={t.id} thread={t} onOpen={onOpen} />
          ))}
        </ul>
      )}
      {error && <p className="notice error-notice">{error}</p>}
      {!result && !error ? (
        <Loader />
      ) : (
        <>
          {section("Routines", routines, "No routines")}
          {section("Reminders", reminders, "No reminders")}
        </>
      )}
      {renaming && (
        <RenameAutomationDialog
          automation={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={() => {
            setRenaming(null);
            onRenamed();
          }}
        />
      )}
      {deleting && (
        <DeleteAutomationDialog
          automation={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            onDeleted();
          }}
        />
      )}
    </aside>
  );
}
