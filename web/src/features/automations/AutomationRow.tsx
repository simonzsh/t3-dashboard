import type { Automation, DashboardThread, ProjectIcon } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { RunningBadge } from "../../lib/StatusBadge.tsx";
import { useCopy } from "../../lib/useCopy.ts";
import { ActionMenu, Badge, Icon, IconButton, Pressable, Switch, type ActionMenuItem } from "../../ui/index.ts";
import { capitalize, copyableUrl, isEditable, isFinishedReminder, isRunning, lastRunLine, latestUnread, nextRunLine, reminderDate, scheduleText } from "./automations.ts";
import { KindBadge } from "./KindBadge.tsx";
import { RunBadge } from "./RunBadge.tsx";

interface Props {
  automation: Automation;
  /** Left out when the row sits under its project header. */
  project: { icon: ProjectIcon | null; title: string } | null;
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

/** Three lines (name, project with schedule and next run, last run) and the controls: switch, Run now, menu. */
export function AutomationRow({ automation: a, project, threads, seen, now, starting, onSelect, onToggle, onRun, onEdit, onDelete }: Props) {
  const finished = isFinishedReminder(a);
  const running = isRunning(a, threads);
  const last = lastRunLine(a, threads, now);
  const next = nextRunLine(a, now);
  const schedule = capitalize(scheduleText(a));
  const { copy } = useCopy("copy the webhook URL");
  const url = copyableUrl(a);
  const items: ActionMenuItem[] = [
    { label: "Edit", icon: "pencil", onSelect: () => onEdit(a), disabled: !isEditable(a), tooltip: isEditable(a) ? undefined : "This automation can't be edited here" },
    ...(url ? [{ label: "Copy webhook URL", icon: "copy" as const, onSelect: () => copy(url) }] : []),
    { label: "Delete", icon: "trash", onSelect: () => onDelete(a), danger: true },
  ];
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
          {project && <ProjectTag icon={project.icon} title={project.title} />}
          {project && (schedule || next) && <span aria-hidden="true">·</span>}
          {schedule && <span className="auto-text">{schedule}</span>}
          {schedule && next && <span aria-hidden="true">·</span>}
          {next && (
            <span className="auto-text" data-tooltip={a.nextRunAt && a.enabled && a.kind !== "webhook" ? reminderDate(a.nextRunAt) : undefined}>
              {next}
            </span>
          )}
        </span>
        <span className="auto-line">
          {last.status ? <RunBadge status={last.status} /> : <span className="auto-text">{last.label}</span>}
          {last.detail && <span className="auto-text">{last.detail}</span>}
        </span>
      </Pressable>
      <div className="auto-row-actions">
        {!finished && <Switch checked={a.enabled} label={`Enable ${a.title}`} onChange={(on) => onToggle(a, on)} />}
        <IconButton variant="ghost" size="sm" label={`Run ${a.title} now`} tooltip="Run now" disabled={running || starting} onClick={() => onRun(a)}>
          <Icon name={running || starting ? "refresh" : "play"} className={running || starting ? "icon spinning" : "icon"} />
        </IconButton>
        <ActionMenu label={`More actions for ${a.title}`} items={items} />
      </div>
    </div>
  );
}
