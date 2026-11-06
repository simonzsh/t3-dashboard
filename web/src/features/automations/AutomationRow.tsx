import type { Automation, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { Badge, Icon, IconButton, Pressable, Switch } from "../../ui/index.ts";
import { RunningBadge } from "../../lib/StatusBadge.tsx";
import { AutomationMenu } from "./AutomationMenu.tsx";
import { capitalize, isFinishedReminder, isRunning, lastRunLine, latestUnread, nextRunLine, reminderDate, scheduleText } from "./automations.ts";
import { KindBadge } from "./KindBadge.tsx";

interface Props {
  automation: Automation;
  threads: ReadonlyMap<string, DashboardThread>;
  seen: SeenState;
  now: Date;
  /** A run request is in flight: the Run now button waits like it does for a running run. */
  starting: boolean;
  onSelect: (id: string) => void;
  onToggle: (a: Automation, enabled: boolean) => void;
  onRun: (a: Automation) => void;
  onEdit: (a: Automation) => void;
  onDelete: (a: Automation) => void;
}

/** Three lines (name, schedule and next run, last run) and the controls: switch, Run now, menu. */
export function AutomationRow({ automation: a, threads, seen, now, starting, onSelect, onToggle, onRun, onEdit, onDelete }: Props) {
  const finished = isFinishedReminder(a);
  const running = isRunning(a, threads);
  const last = lastRunLine(a, threads, now);
  const next = nextRunLine(a, now);
  const schedule = capitalize(scheduleText(a));
  return (
    <div className={`auto-row${!a.enabled ? " dim" : ""}`}>
      <Pressable className="auto-row-main" onClick={() => onSelect(a.id)}>
        <span className="auto-line">
          <span className="auto-name">{a.title}</span>
          <KindBadge kind={a.kind} />
          {running && <RunningBadge />}
          {finished ? <Badge>Finished</Badge> : !a.enabled && <Badge>Paused</Badge>}
          {latestUnread(a, threads, seen) && <span className="notif-dot" role="img" aria-label="Unread" />}
        </span>
        <span className="auto-line">
          {schedule && <span className="auto-text">{schedule}</span>}
          {schedule && next && <span aria-hidden="true">·</span>}
          {next && (
            <span className="auto-text" data-tooltip={a.nextRunAt && a.enabled && a.kind !== "webhook" ? reminderDate(a.nextRunAt) : undefined}>
              {next}
            </span>
          )}
        </span>
        <span className="auto-line">
          <span className={`run-dot ${last.tone}`} aria-hidden="true" />
          <span className={`auto-text${last.tone === "error" ? " auto-fail" : ""}`}>
            {last.label}
            {last.detail && ` · ${last.detail}`}
          </span>
        </span>
      </Pressable>
      <div className="auto-row-actions">
        {!finished && <Switch checked={a.enabled} label={`Enable ${a.title}`} onChange={(on) => onToggle(a, on)} />}
        <IconButton variant="ghost" size="sm" label={`Run ${a.title} now`} tooltip="Run now" disabled={running || starting} onClick={() => onRun(a)}>
          <Icon name={running || starting ? "refresh" : "play"} className={running || starting ? "icon spinning" : "icon"} />
        </IconButton>
        <AutomationMenu automation={a} withEdit onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}
