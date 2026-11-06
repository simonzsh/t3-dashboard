import { useEffect, useRef } from "react";
import type { Automation, DashboardProject, DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { RunningBadge } from "../../lib/StatusBadge.tsx";
import { Badge, Button, Icon, IconButton, Switch, trapTab } from "../../ui/index.ts";
import { RUNTIME_MODE_LABELS } from "../conversation/composer.ts";
import { AutomationMenu } from "./AutomationMenu.tsx";
import { capitalize, isEditable, isFinishedReminder, isRunning, lastRunLine, liveRuns, modelLabel, nextRunText, scheduleText } from "./automations.ts";
import { KindBadge } from "./KindBadge.tsx";
import { RunRow } from "./RunRow.tsx";

interface Props {
  automation: Automation;
  threads: ReadonlyMap<string, DashboardThread>;
  project: DashboardProject | undefined;
  providers: DashboardProvider[];
  seen: SeenState;
  now: Date;
  starting: boolean;
  onClose: () => void;
  onOpen: (id: string, addOnly: boolean) => void;
  onToggle: (a: Automation, enabled: boolean) => void;
  onRun: (a: Automation) => void;
  onEdit: (a: Automation) => void;
  onDelete: (a: Automation) => void;
}

/** One automation in a side sheet: settings, prompt and the history of its runs. */
export function AutomationSheet({ automation: a, threads, project, providers, seen, now, starting, onClose, onOpen, onToggle, onRun, onEdit, onDelete }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const model = modelLabel(providers, a.modelSelection);
  const runs = liveRuns(a, threads);
  const last = lastRunLine(a, threads, now);
  const session = a.bound && a.threadId && threads.has(a.threadId) ? a.threadId : null;
  const running = isRunning(a, threads);
  const busy = running || starting;
  const finished = isFinishedReminder(a);

  // The sheet takes the focus, and gives it back to the row that opened it.
  useEffect(() => {
    const before = document.activeElement;
    sheet.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, []);

  return (
    <>
      <div className="auto-backdrop" aria-hidden="true" onClick={onClose} />
      <aside ref={sheet} tabIndex={-1} className="auto-sheet" role="dialog" aria-modal="true" aria-label={a.title} onKeyDown={trapTab}>
        <header className="auto-sheet-head">
          <div className="auto-sheet-top">
            <KindBadge kind={a.kind} />
            {running && <RunningBadge />}
            {finished ? <Badge>Finished</Badge> : !a.enabled && <Badge>Paused</Badge>}
            <IconButton variant="ghost" size="sm" label="Close" onClick={onClose}>
              <Icon name="x" />
            </IconButton>
          </div>
          <h2 className="auto-sheet-title">{a.title}</h2>
          <p className="auto-note">{capitalize(scheduleText(a))}</p>
          <div className="auto-sheet-actions">
            <Button size="sm" disabled={busy} onClick={() => onRun(a)}>
              <Icon name={busy ? "refresh" : "play"} className={busy ? "icon spinning" : "icon"} />
              Run now
            </Button>
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
            <AutomationMenu automation={a} withEdit={false} onEdit={onEdit} onDelete={onDelete} />
            {!finished && <Switch checked={a.enabled} label={`Enable ${a.title}`} onChange={(on) => onToggle(a, on)} />}
          </div>
        </header>
        <div className="auto-sheet-body">
          <dl className="auto-facts">
            <dt>Next run</dt>
            <dd>{nextRunText(a, now)}</dd>
            <dt>Last run</dt>
            <dd>{last.detail ? `${last.label} · ${last.detail}` : last.label}</dd>
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
            {a.runtimeMode && (
              <>
                <dt>Mode</dt>
                <dd>{RUNTIME_MODE_LABELS[a.runtimeMode].label}</dd>
              </>
            )}
            {session && (
              <>
                <dt>Bound thread</dt>
                <dd>
                  <Button size="sm" variant="link" onClick={(e) => onOpen(session, e.shiftKey)}>
                    Open session
                  </Button>
                </dd>
              </>
            )}
          </dl>
          <section className="auto-section" aria-label="Prompt">
            <h3 className="auto-section-title">Prompt</h3>
            <pre className="auto-prompt">{a.prompt}</pre>
          </section>
          <section className="auto-section" aria-label="Run history">
            <h3 className="auto-section-title">Run history</h3>
            {runs.length === 0 ? (
              <p className="auto-note">No runs yet</p>
            ) : (
              <div className="auto-card">
                <ul className="auto-rows">
                  {runs.map((run) => (
                    <li key={`${run.threadId ?? ""}:${run.startedAt}`}>
                      <RunRow automation={a} run={run} threads={threads} seen={seen} now={now} onOpen={onOpen} variant="history" />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="auto-note">The dashboard keeps this history. A run may be missing if its session was archived before the dashboard saw it.</p>
          </section>
        </div>
      </aside>
    </>
  );
}
