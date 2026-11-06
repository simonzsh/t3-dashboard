import type { Automation, DashboardProject, DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { useCopy } from "../../lib/useCopy.ts";
import { Button, Icon, IconButton } from "../../ui/index.ts";
import { copyableUrl, isEditable, liveRuns, modelLabel, nextRunText, reminderDate, runDuration, runUnread, scheduleText } from "./automations.ts";
import { RunBadge } from "./RunBadge.tsx";

interface Props {
  automation: Automation;
  threads: ReadonlyMap<string, DashboardThread>;
  project: DashboardProject | undefined;
  providers: DashboardProvider[];
  seen: SeenState;
  now: Date;
  /** On a phone the panel fills the page: the button goes back to the list instead of closing. */
  compact: boolean;
  onClose: () => void;
  onOpen: (id: string, addOnly: boolean) => void;
  onEdit: (a: Automation) => void;
  onDelete: (a: Automation) => void;
}

function CopyUrlButton({ url }: { url: string }) {
  const { copied, copy } = useCopy("copy the webhook URL");
  return (
    <Button size="sm" onClick={() => copy(url)}>
      <Icon name={copied ? "check" : "copy"} />
      Copy webhook URL
    </Button>
  );
}

/** One automation: its settings, its actions and the history of its runs. */
export function AutomationPanel({ automation: a, threads, project, providers, seen, now, compact, onClose, onOpen, onEdit, onDelete }: Props) {
  const model = modelLabel(providers, a.modelSelection);
  const url = copyableUrl(a);
  const runs = liveRuns(a, threads);
  const session = a.threadId && threads.has(a.threadId) ? a.threadId : null;
  return (
    <aside className="auto-panel" aria-label={a.title}>
      <header className="auto-panel-head">
        <IconButton variant="ghost" size="sm" label={compact ? "Back to the list" : "Close the panel"} onClick={onClose}>
          <Icon name={compact ? "arrowLeft" : "x"} />
        </IconButton>
        <h2 className="auto-panel-title">{a.title}</h2>
      </header>
      <dl className="auto-facts">
        <dt>Kind</dt>
        <dd>{a.kind === "webhook" ? "Webhook" : a.kind === "reminder" ? "Reminder" : "Routine"}</dd>
        <dt>Schedule</dt>
        <dd>{scheduleText(a)}</dd>
        <dt>Project</dt>
        <dd>
          <ProjectTag icon={project?.icon ?? null} title={a.project} />
        </dd>
        {model && (
          <>
            <dt>Model</dt>
            <dd className="auto-model">
              <ProviderIcon provider={model.instanceId} />
              {model.name}
            </dd>
          </>
        )}
        <dt>Next run</dt>
        <dd>{nextRunText(a, now)}</dd>
        <dt>State</dt>
        <dd>{a.enabled ? "On" : "Paused"}</dd>
      </dl>
      <div className="auto-panel-actions">
        {session && (
          <Button size="sm" onClick={(e) => onOpen(session, e.shiftKey)}>
            Open session
          </Button>
        )}
        {isEditable(a) ? (
          <Button size="sm" onClick={() => onEdit(a)}>
            Edit
          </Button>
        ) : (
          // A disabled button gets no hover events: the wrapper carries the tooltip.
          <span data-tooltip="This automation can't be edited here">
            <Button size="sm" disabled>
              Edit
            </Button>
          </span>
        )}
        {url && <CopyUrlButton url={url} />}
        <Button size="sm" variant="danger" onClick={() => onDelete(a)}>
          Delete
        </Button>
      </div>
      <h3 className="auto-section-title">History</h3>
      {runs.length === 0 ? (
        <p className="auto-note">No runs yet</p>
      ) : (
        <ul className="auto-history">
          {runs.map((run) => {
            const thread = run.threadId ? threads.get(run.threadId) : undefined;
            const duration = runDuration(run, now);
            const { threadId } = run;
            return (
              <li key={`${threadId ?? ""}:${run.startedAt}`} className="auto-history-row">
                <RunBadge run={run} />
                <span className="auto-history-when">
                  {reminderDate(run.startedAt)}
                  {duration && ` · ${duration}`}
                  {/* Tooltips don't exist on touch screens: the error shows as text. */}
                  {run.status === "failed" && run.error && <span className="auto-history-error">{run.error}</span>}
                </span>
                {runUnread(a, run, threads, seen) && <span className="notif-dot" role="img" aria-label="Unread" />}
                {thread && threadId ? (
                  <Button size="sm" variant="ghost" onClick={(e) => onOpen(threadId, e.shiftKey)}>
                    Open
                  </Button>
                ) : (
                  <span className="auto-note">{threadId ? "Session archived" : "No session"}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <p className="auto-note">The dashboard keeps this history. A run may be missing if its session was archived before the dashboard saw it.</p>
    </aside>
  );
}
