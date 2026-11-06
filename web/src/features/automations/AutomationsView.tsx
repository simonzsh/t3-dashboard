import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Automation, AutomationsResult, DashboardState, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { Button, Dropdown, Icon, Loader, TextInput, useEscape } from "../../ui/index.ts";
import { automationProjects, filterAutomations, groupAutomations, recentRuns, type AutomationGroup } from "./automations.ts";
import { AutomationList } from "./AutomationList.tsx";
import { AutomationPanel } from "./AutomationPanel.tsx";
import { DeleteAutomationDialog } from "./DeleteAutomationDialog.tsx";
import { NewAutomationDialog } from "../new-thread/NewAutomationDialog.tsx";
import { RecentRuns } from "./RecentRuns.tsx";

interface Props {
  state: DashboardState;
  now: Date;
  seen: SeenState;
  /** The phone layout: a selected automation fills the page. */
  compact: boolean;
  onOpen: (id: string, addOnly: boolean) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  onAutomationsStale: () => Promise<void>;
  onNewAutomation: () => void;
  /** Setup rows from `useSetupRows`, owned by App. */
  setup: DashboardThread[];
}

// T3 gives "" to a task without a project: "all" needs an id no task can have.
const ALL_PROJECTS = "*all";
const NO_GROUPS: ReadonlySet<AutomationGroup> = new Set();

export function AutomationsView({ state, now, seen, compact, onOpen, automations, automationsError, onAutomationsStale, onNewAutomation, setup }: Props) {
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState(ALL_PROJECTS);
  const [open, setOpen] = useState<ReadonlySet<AutomationGroup>>(NO_GROUPS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Automation | null>(null);
  const [editing, setEditing] = useState<Automation | null>(null);
  const threads = useMemo(() => new Map(state.threads.map((t) => [t.id, t])), [state.threads]);
  const projects = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);
  const all = useMemo(() => automations?.automations ?? [], [automations]);
  const shown = useMemo(() => filterAutomations(all, { projectId: projectId === ALL_PROJECTS ? null : projectId, query }), [all, projectId, query]);
  const groups = useMemo(() => groupAutomations(shown, threads, seen), [shown, threads, seen]);
  const recent = useMemo(() => recentRuns(all, threads, 8), [all, threads]);
  const options = useMemo(() => [{ id: ALL_PROJECTS, label: "All projects" }, ...automationProjects(all).map((p) => ({ id: p.id, label: p.title, icon: <ProjectIcon icon={projects.get(p.id)?.icon ?? null} title={p.title} /> }))], [all, projects]);
  const selected = all.find((a) => a.id === selectedId) ?? null;

  // The task was deleted, here or elsewhere: nothing stays selected.
  useEffect(() => {
    if (selectedId !== null && !selected && automations) setSelectedId(null);
  }, [selectedId, selected, automations]);
  const toggle = useCallback((group: AutomationGroup) => setOpen((s) => new Set(s.has(group) ? [...s].filter((g) => g !== group) : [...s, group])), []);
  // On a phone the window scrolls: the panel opens at the top, and Back returns to the list position.
  const listScroll = useRef(0);
  const select = useCallback(
    (id: string) => {
      if (compact) {
        listScroll.current = window.scrollY;
        window.scrollTo(0, 0);
      }
      setSelectedId(id);
    },
    [compact],
  );
  const close = useCallback(() => {
    setSelectedId(null);
    if (compact) requestAnimationFrame(() => window.scrollTo(0, listScroll.current));
  }, [compact]);
  const dialogOpen = editing !== null || deleting !== null;
  useEscape(() => {
    if (compact && selected && !dialogOpen) close();
  });

  if (state.connection.t3 !== "live") {
    return (
      <div className="empty-state">
        <strong>T3 Code is not connected</strong>
        <span>Automations show here once the connection is back.</span>
      </div>
    );
  }
  if (!automations && !automationsError) return <Loader />;
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
        <strong>No automations yet</strong>
        <span>Routines, reminders and webhooks appear here.</span>
        <Button variant="primary" onClick={onNewAutomation}>
          New Automation
        </Button>
      </div>
    );
  }
  const panelOnly = compact && selected !== null;
  return (
    <div className={`auto-page${panelOnly ? " panel-only" : ""}`}>
      {!panelOnly && (
        <>
          <RecentRuns runs={recent} threads={threads} seen={seen} now={now} onOpen={onOpen} />
          <div className="auto-toolbar">
            <div className="auto-search">
              <Icon name="search" />
              <TextInput aria-label="Search automations" placeholder="Search automations…" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <Dropdown label="Project" value={projectId} options={options} onPick={setProjectId} filterable searchPlaceholder="Search projects…" />
          </div>
        </>
      )}
      <div className="auto-body">
        {!panelOnly &&
          (shown.length === 0 && setup.length === 0 ? (
            <div className="empty-state auto-main">
              <strong>No automation matches</strong>
              <span>Change the search or the project.</span>
            </div>
          ) : (
            <div className="auto-main">
              <AutomationList groups={groups} open={open} onToggle={toggle} setup={setup} threads={threads} projects={projects} selectedId={selectedId} now={now} onSelect={select} onOpen={onOpen} />
            </div>
          ))}
        {selected && (
          <AutomationPanel
            automation={selected}
            threads={threads}
            project={projects.get(selected.projectId)}
            providers={state.providers}
            seen={seen}
            now={now}
            compact={compact}
            onClose={close}
            onOpen={onOpen}
            onEdit={setEditing}
            onDelete={setDeleting}
          />
        )}
      </div>
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
