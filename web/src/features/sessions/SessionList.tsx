import { memo, useMemo } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { relativeTime } from "../../lib/format.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { modelLabel } from "../../lib/models.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Icon, IconButton, Pressable } from "../../ui/index.ts";
import { ProjectMenu } from "./ProjectMenu.tsx";
import { groupByProject, listableThreads, statusMark, type ListPrefs } from "./sessionList.ts";

const MARK_LABELS = { running: "Running", waiting: "Waiting for you", error: "Failed", unread: "Unread" } as const;

interface Props {
  threads: DashboardThread[];
  projects: DashboardProject[];
  seen: SeenState;
  /** Model slug -> display name. */
  modelNames: ReadonlyMap<string, string>;
  now: Date;
  openIds: ReadonlySet<string>;
  focusedId: string | null;
  prefs: ListPrefs;
  onPrefs: (change: Partial<ListPrefs>) => void;
  onOpen: (id: string) => void;
  onNewSession: (projectId: string) => void;
  onAddProject: () => void;
  onEditProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onClose: (id: string) => void;
  onCloseAll: () => void;
}

/** Every listed thread, by project or by recent activity: a click opens it as a session. */
function SessionListView({ threads, projects, seen, modelNames, now, openIds, focusedId, prefs, onPrefs, onOpen, onNewSession, onAddProject, onEditProject, onDeleteProject, onClose, onCloseAll }: Props) {
  const shown = useMemo(() => listableThreads(threads), [threads]);
  const collapsed = new Set(prefs.collapsed);
  const grouped = prefs.mode === "grouped";
  const projectGroups = useMemo(() => (grouped ? groupByProject(shown, projects) : []), [grouped, shown, projects]);
  // Empty projects have nothing to fold.
  const foldable = useMemo(() => projectGroups.filter((g) => g.threads.length > 0), [projectGroups]);
  const anyOpen = foldable.some((g) => !collapsed.has(g.id));
  const toMode = grouped ? "flat" : "grouped";
  const modeLabel = grouped ? "Show one list by recent activity" : "Group by project";
  const foldLabel = anyOpen ? "Collapse all projects" : "Expand all projects";
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const row = (t: DashboardThread) => {
    const mark = statusMark(t, seen);
    const model = modelLabel(t.model, modelNames);
    const project = projectsById.get(t.projectId);
    const title = threadTitle(t);
    const isOpen = openIds.has(t.id);
    return (
      <div key={t.id} className="slist-item">
        <Pressable className={`slist-row${isOpen ? " open" : ""}${t.id === focusedId ? " focused" : ""}`} aria-current={t.id === focusedId || undefined} onClick={() => onOpen(t.id)}>
          <span className={`slist-mark${mark ? ` ${mark}` : ""}`} role={mark ? "img" : undefined} aria-label={mark ? MARK_LABELS[mark] : undefined} aria-hidden={mark ? undefined : true} />
          <span className="slist-text">
            <span className="title-line">
              <span className="slist-title">{title}</span>
              <AutomationMark id={t.id} />
            </span>
            <span className="slist-meta">
              {relativeTime(t.lastActivityAt, now)}
              {/* Grouped rows sit under their project, so they name the model; flat rows name the project. */}
              {grouped
                ? model && (
                    <>
                      {" · "}
                      <ProviderIcon provider={t.provider} />
                      {model}
                    </>
                  )
                : project && (
                    <>
                      {" · "}
                      <ProjectIcon icon={project.icon} title={project.title} />
                      {project.title}
                    </>
                  )}
            </span>
          </span>
        </Pressable>
        {/* A sibling of the row, not inside it: a button cannot hold another button. */}
        {isOpen && (
          <IconButton variant="ghost" size="sm" className="slist-close" label={`Close ${title}`} tooltip="Close session" onClick={() => onClose(t.id)}>
            <Icon name="x" />
          </IconButton>
        )}
      </div>
    );
  };

  const groups =
    grouped
      ? projectGroups.map((g) => {
          const newSession = g.project && (
            <>
              <ProjectMenu title={g.title} onEdit={() => onEditProject(g.id)} onDelete={() => onDeleteProject(g.id)} />
              <IconButton variant="ghost" size="sm" className="slist-new" label={`New session in ${g.title}`} tooltip="New session here" onClick={() => onNewSession(g.id)}>
                <Icon name="plus" />
              </IconButton>
            </>
          );
          if (g.threads.length === 0) {
            return (
              <section key={g.id} aria-label={g.title}>
                <div className="slist-project empty">
                  <span className="slist-project-toggle">
                    <span className="slist-chevron" aria-hidden="true" />
                    <ProjectIcon icon={g.project?.icon ?? null} title={g.title} />
                    <span className="slist-project-title">{g.title}</span>
                  </span>
                  {newSession}
                </div>
              </section>
            );
          }
          const open = !collapsed.has(g.id);
          const toggle = () => onPrefs({ collapsed: open ? [...prefs.collapsed, g.id] : prefs.collapsed.filter((id) => id !== g.id) });
          return (
            <section key={g.id} aria-label={g.title}>
              <div className="slist-project">
                <Pressable className="slist-project-toggle" aria-expanded={open} onClick={toggle}>
                  <Icon name={open ? "chevron" : "chevronRight"} className="icon slist-chevron" />
                  <ProjectIcon icon={g.project?.icon ?? null} title={g.title} />
                  <span className="slist-project-title">{g.title}</span>
                  {g.running > 0 && <span className="slist-count" aria-label={`${g.running} running`}>{g.running}</span>}
                  <span className="slist-total" aria-label={`${g.threads.length} ${g.threads.length === 1 ? "session" : "sessions"}`}>{g.threads.length}</span>
                </Pressable>
                {newSession}
              </div>
              {open && g.threads.map(row)}
            </section>
          );
        })
      : shown.map(row);

  return (
    <aside className="slist" aria-label="Sessions list">
      <div className="slist-bar">
        <IconButton variant="ghost" size="sm" label="Add project" tooltip="Add project" onClick={onAddProject}>
          <Icon name="folderPlus" />
        </IconButton>
        {grouped && (
          <IconButton variant="ghost" size="sm" label={foldLabel} tooltip={foldLabel} disabled={foldable.length === 0} onClick={() => onPrefs({ collapsed: anyOpen ? foldable.map((g) => g.id) : [] })}>
            <Icon name={anyOpen ? "chevronsDownUp" : "chevronsUpDown"} />
          </IconButton>
        )}
        <IconButton variant="ghost" size="sm" label={modeLabel} tooltip={modeLabel} onClick={() => onPrefs({ mode: toMode })}>
          <Icon name={toMode === "grouped" ? "listTree" : "list"} />
        </IconButton>
        <IconButton variant="ghost" size="sm" label="Close all sessions" tooltip="Close all sessions" disabled={openIds.size === 0} onClick={onCloseAll}>
          <Icon name="copyX" />
        </IconButton>
      </div>
      <div className="slist-body">
        {(grouped ? projectGroups.length === 0 : shown.length === 0) ? <p className="slist-empty">No sessions yet.</p> : groups}
      </div>
    </aside>
  );
}

// Memoized: SessionsView rerenders on every live event, and the list has a row per thread.
export const SessionList = memo(SessionListView);
