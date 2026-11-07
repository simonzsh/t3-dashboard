import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Automation, AutomationsResult, DashboardProject, DashboardState, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { RunningBadge, StatusBadge } from "../../lib/StatusBadge.tsx";
import { ProjectTag } from "../../lib/ProjectTag.tsx";
import { Badge, Button, Dropdown, Icon, Pressable, Segmented, Sheet, Skeleton, SkeletonGroup, TextInput } from "../../ui/index.ts";
import { NewAutomationDialog } from "../new-thread/NewAutomationDialog.tsx";
import { AutomationRow } from "./AutomationRow.tsx";
import { AutomationSheet } from "./AutomationSheet.tsx";
import { filterAutomations, latestUnread, matchesFilter, sortAutomations, type AutomationFilter, type AutomationSort } from "./automations.ts";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog.tsx";
import { useAutomationPrefs } from "./prefs.ts";
import { useAutomationActions } from "./useAutomationActions.ts";

interface Props {
  state: DashboardState;
  now: Date;
  seen: SeenState;
  onOpen: (id: string, addOnly: boolean) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  onAutomationsStale: () => Promise<void>;
  onNewAutomation: () => void;
  /** Setup rows from `useSetupRows`, owned by App. */
  setup: DashboardThread[];
}

const SORTS: Array<{ id: AutomationSort; label: string }> = [
  { id: "recent", label: "Recent activity" },
  { id: "next", label: "Next run" },
  { id: "project", label: "Project" },
  { id: "name", label: "Name" },
];

const EMPTY: Record<AutomationFilter, string> = {
  all: "No automation matches.",
  unread: "No unread runs.",
  failed: "No failed runs.",
  running: "No running automations.",
  paused: "No paused automations.",
};

/** Rows under their project, in the order of T3 Code's projects; unknown projects last. */
function groupByProject(list: Automation[], projects: DashboardProject[]) {
  const groups = new Map<string, { id: string; project: DashboardProject | null; title: string; rows: Automation[] }>();
  for (const p of projects) groups.set(p.id, { id: p.id, project: p, title: p.title, rows: [] });
  for (const a of list) {
    const group = groups.get(a.projectId) ?? { id: a.projectId, project: null, title: a.project, rows: [] };
    group.rows.push(a);
    groups.set(a.projectId, group);
  }
  return [...groups.values()].filter((g) => g.rows.length > 0);
}

function Skeletons() {
  return (
    <SkeletonGroup label="Loading automations">
      <div className="auto-card">
        <ul className="auto-rows">
          {[0, 1, 2].map((i) => (
            <li key={i} className="auto-skeleton">
              <Skeleton width="40%" height={14} />
              <Skeleton width="60%" />
              <Skeleton width="30%" />
            </li>
          ))}
        </ul>
      </div>
    </SkeletonGroup>
  );
}

export function AutomationsView({ state, now, seen, onOpen, automations, automationsError, onAutomationsStale, onNewAutomation, setup }: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const actions = useAutomationActions(onAutomationsStale);
  const threads = useMemo(() => new Map(state.threads.map((t) => [t.id, t])), [state.threads]);
  const projects = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);
  const { withPending } = actions;
  const all = useMemo(() => withPending(automations?.automations ?? []), [automations, withPending]);
  const [prefs, setPrefs] = useAutomationPrefs();
  const unread = useMemo(() => all.filter((a) => latestUnread(a, threads, seen)).length, [all, threads, seen]);
  const sorted = useMemo(
    () => sortAutomations(filterAutomations(all, query).filter((a) => matchesFilter(a, prefs.filter, threads, seen)), prefs.sort),
    [all, query, prefs, threads, seen],
  );
  const grouped = prefs.sort === "project";
  const groups = useMemo(() => (grouped ? groupByProject(sorted, state.projects) : []), [grouped, sorted, state.projects]);
  // Setup threads have no run to filter on: they show in the full list and under Running.
  const setupRows = query === "" && (prefs.filter === "all" || prefs.filter === "running") ? setup : [];
  const selected = all.find((a) => a.id === selectedId) ?? null;
  // The sheet stays mounted to slide out: it keeps showing the last selection while it closes.
  const shown = useRef<string | null>(null);
  if (selected) shown.current = selected.id;
  const sheetAutomation = selected ?? all.find((a) => a.id === shown.current) ?? null;

  // The task was deleted, here or elsewhere: nothing stays selected.
  useEffect(() => {
    if (selectedId !== null && !selected && automations) setSelectedId(null);
  }, [selectedId, selected, automations]);
  const close = useCallback(() => setSelectedId(null), []);
  const dialogOpen = editing !== null || deleting !== null;
  // A dialog over the sheet takes Escape first.
  const closeSheet = useCallback(() => {
    if (!dialogOpen) close();
  }, [dialogOpen, close]);

  if (state.connection.t3 !== "live") {
    return (
      <div className="empty-state">
        <strong>T3 Code is not connected</strong>
        <span>Automations show here once the connection is back.</span>
      </div>
    );
  }
  if (!automations && !automationsError) return <div className="auto-page"><Skeletons /></div>;
  if (!automations) {
    return (
      <div className="empty-state">
        <strong>Automations could not be loaded</strong>
        <span>{automationsError}</span>
      </div>
    );
  }
  if (all.length === 0 && setup.length === 0) {
    return (
      <div className="empty-state">
        <Icon name="calendarClock" />
        <strong>No automations yet</strong>
        <span>Routines, reminders and webhooks appear here.</span>
        <Button variant="primary" onClick={onNewAutomation}>
          New automation
        </Button>
      </div>
    );
  }
  return (
    <div className="auto-page">
      <section className="auto-section" aria-label="Automations">
        <div className="auto-toolbar">
          <div className="auto-search">
            <Icon name="search" />
            <TextInput aria-label="Search automations" placeholder="Search automations…" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Segmented
            label="Filter automations"
            value={prefs.filter}
            options={[
              { id: "all", label: "All" },
              { id: "unread", label: unread > 0 ? `Unread ${unread}` : "Unread" },
              { id: "failed", label: "Failed" },
              { id: "running", label: "Running" },
              { id: "paused", label: "Paused" },
            ]}
            onChange={(filter) => setPrefs({ filter })}
          />
          <Dropdown label="Sort automations" className="auto-sort" value={prefs.sort} options={SORTS} onPick={(sort) => setPrefs({ sort: sort as AutomationSort })} />
        </div>
        {sorted.length === 0 && setupRows.length === 0 ? (
          <p className="auto-empty">{query !== "" ? "No automation matches." : EMPTY[prefs.filter]}</p>
        ) : (
          <div className="auto-card">
            <ul className="auto-rows">
              {setupRows.map((t) => (
                <li key={t.id}>
                  <div className="auto-row">
                    <Pressable className="auto-row-main" onClick={(e) => onOpen(t.id, e.shiftKey)}>
                      <span className="auto-line">
                        <span className="auto-name">{t.title}</span>
                        <Badge>Setting up</Badge>
                        <StatusBadge thread={t} status={agentStatus(t)} />
                      </span>
                    </Pressable>
                  </div>
                </li>
              ))}
              {(grouped ? groups : [{ id: "", project: null, title: "", rows: sorted }]).map((g) => (
                <Fragment key={g.id}>
                  {grouped && (
                    <li className="auto-group-head">
                      <ProjectTag icon={g.project?.icon ?? null} title={g.title} />
                      <span className="auto-group-count">{g.rows.length}</span>
                    </li>
                  )}
                  {g.rows.map((a) => (
                    <li key={a.id}>
                      <AutomationRow
                        automation={a}
                        project={grouped ? null : { icon: projects.get(a.projectId)?.icon ?? null, title: a.project }}
                        threads={threads}
                        seen={seen}
                        now={now}
                        starting={actions.starting.has(a.id)}
                        onSelect={setSelectedId}
                        onToggle={actions.toggle}
                        onRun={actions.run}
                        onEdit={setEditing}
                        onDelete={setDeleting}
                      />
                    </li>
                  ))}
                </Fragment>
              ))}
            </ul>
          </div>
        )}
      </section>
      <Sheet open={selected !== null} label={sheetAutomation?.title ?? "Automation"} width="wide" onClose={closeSheet}>
        {sheetAutomation && (
          <AutomationSheet
            automation={sheetAutomation}
            threads={threads}
            project={projects.get(sheetAutomation.projectId)}
            providers={state.providers}
            seen={seen}
            now={now}
            starting={actions.starting.has(sheetAutomation.id)}
            onClose={close}
            onOpen={onOpen}
            onToggle={actions.toggle}
            onRun={actions.run}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        )}
      </Sheet>
      {editing && (
        <NewAutomationDialog
          projects={state.projects}
          providers={state.providers}
          defaults={state.modelDefaults}
          automation={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void onAutomationsStale()}
        />
      )}
      {deleting && (
        <DeleteAutomationDialog
          automation={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            void onAutomationsStale();
          }}
        />
      )}
    </div>
  );
}
