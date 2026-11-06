import type { ReactNode } from "react";
import type { Automation, DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { RunningBadge, StatusBadge } from "../../lib/StatusBadge.tsx";
import { Badge, Icon, Pressable, type IconName } from "../../ui/index.ts";
import { lastResult, nextRunText, scheduleText, type AutomationGroup } from "./automations.ts";
import { RunBadge } from "./RunBadge.tsx";

const GROUPS: ReadonlyArray<{ id: AutomationGroup; title: string }> = [
  { id: "running", title: "Running" },
  { id: "attention", title: "Needs attention" },
  { id: "upcoming", title: "Upcoming" },
  { id: "paused", title: "Paused" },
  { id: "finished", title: "Finished" },
];
const KIND_ICONS: Record<Automation["kind"], { icon: IconName; label: string }> = {
  routine: { icon: "refresh", label: "Routine" },
  reminder: { icon: "bell", label: "Reminder" },
  webhook: { icon: "bolt", label: "Webhook" },
};

interface Props {
  groups: Record<AutomationGroup, Automation[]>;
  /** Paused and finished tasks need nothing from the user: they start closed. */
  open: ReadonlySet<AutomationGroup>;
  onToggle: (group: AutomationGroup) => void;
  setup: DashboardThread[];
  threads: ReadonlyMap<string, DashboardThread>;
  projects: ReadonlyMap<string, DashboardProject>;
  selectedId: string | null;
  now: Date;
  onSelect: (id: string) => void;
  onOpen: (id: string, addOnly: boolean) => void;
}

function Result({ a, threads }: { a: Automation; threads: ReadonlyMap<string, DashboardThread> }) {
  const last = lastResult(a, threads);
  if (!last) return null;
  if (last.kind === "running") return <RunningBadge />;
  if (last.kind === "done") return <Badge variant="done">Finished {last.at}</Badge>;
  return <RunBadge run={{ status: last.kind, error: last.kind === "failed" ? last.error : null }} />;
}

function Group({ title, count, open, onToggle, children }: { title: string; count: number; open?: boolean; onToggle?: () => void; children: ReactNode }) {
  const head = (
    <>
      {onToggle && <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />}
      {title} <span className="count">{count}</span>
    </>
  );
  return (
    <section className="auto-group" aria-label={title}>
      <h2 className="auto-group-head">
        {onToggle ? (
          <Pressable className="auto-group-toggle" aria-expanded={open} onClick={onToggle}>
            {head}
          </Pressable>
        ) : (
          head
        )}
      </h2>
      {(!onToggle || open) && <div className="auto-rows">{children}</div>}
    </section>
  );
}

/** The tasks in groups: one row each, with the setup threads on top. */
export function AutomationList({ groups, open, onToggle, setup, threads, projects, selectedId, now, onSelect, onOpen }: Props) {
  return (
    <div className="auto-list">
      {setup.length > 0 && (
        <Group title="Setting up" count={setup.length}>
          {setup.map((t) => (
            <Pressable key={t.id} className="auto-row auto-row-setup" onClick={(e) => onOpen(t.id, e.shiftKey)}>
              <span className="auto-row-title">{t.title}</span>
              <span className="auto-row-result">
                <StatusBadge thread={t} status={agentStatus(t)} />
              </span>
            </Pressable>
          ))}
        </Group>
      )}
      {GROUPS.map(({ id, title }) => {
        const list = groups[id];
        if (list.length === 0) return null;
        const collapsible = id === "paused" || id === "finished";
        return (
          <Group key={id} title={title} count={list.length} open={open.has(id)} onToggle={collapsible ? () => onToggle(id) : undefined}>
            {list.map((a) => {
              const kind = KIND_ICONS[a.kind];
              return (
                <Pressable key={a.id} className={`auto-row${a.id === selectedId ? " selected" : ""}`} aria-current={a.id === selectedId || undefined} onClick={() => onSelect(a.id)}>
                  <span className="auto-row-title">
                    <Icon name={kind.icon} label={kind.label} className="icon auto-kind" />
                    <span className="auto-row-name">{a.title}</span>
                  </span>
                  <span className="auto-row-project">
                    <ProjectTag icon={projects.get(a.projectId)?.icon ?? null} title={a.project} />
                  </span>
                  <span className="auto-row-schedule">{scheduleText(a)}</span>
                  <span className="auto-row-next">{nextRunText(a, now)}</span>
                  <span className="auto-row-result">
                    <Result a={a} threads={threads} />
                  </span>
                </Pressable>
              );
            })}
          </Group>
        );
      })}
    </div>
  );
}
