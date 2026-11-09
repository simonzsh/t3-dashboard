import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { relativeTime } from "../../lib/format.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { AutomationMark } from "../../lib/automationThreads.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";
import { modelLabel } from "../../lib/models.ts";
import { threadTitle } from "../../lib/threads.ts";
import { Chevron, CountBadge, Icon, IconButton, Pressable } from "../../ui/index.ts";
import { ProjectMenu } from "./ProjectMenu.tsx";
import { groupByProject, listableThreads, recentSettledThreads, statusMark, type ListPrefs } from "./sessionList.ts";

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
  const [settledOpen, setSettledOpen] = useState(false);
  const settled = useMemo(() => recentSettledThreads(threads, now), [threads, now]);
  const settledPanel = useRef<HTMLElement>(null);
  const settledContent = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const panel = settledPanel.current;
    const content = settledContent.current;
    const bar = panel?.firstElementChild;
    if (!panel || !content || !bar) return;
    // Animate the bounded height directly so long lists do not move after the panel reaches its cap.
    const measure = () => {
      const barHeight = bar.getBoundingClientRect().height;
      panel.style.setProperty("--settled-bar-height", `${barHeight + 1}px`);
      panel.style.setProperty("--settled-height", `${barHeight + content.getBoundingClientRect().height + 1}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [settled.length]);
  const collapsed = new Set(prefs.collapsed);
  const grouped = prefs.mode === "grouped";
  const projectGroups = useMemo(() => (grouped ? groupByProject(shown, projects, seen) : []), [grouped, shown, projects, seen]);
  // Empty projects have nothing to fold.
  const foldable = useMemo(() => projectGroups.filter((g) => g.threads.length > 0), [projectGroups]);
  const anyOpen = foldable.some((g) => !collapsed.has(g.id));
  const toMode = grouped ? "flat" : "grouped";
  const modeLabel = grouped ? "Show one list by recent activity" : "Group by project";
  const foldLabel = anyOpen ? "Collapse all projects" : "Expand all projects";
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const row = (t: DashboardThread, settledRow = false) => {
    const mark = statusMark(t, seen);
    const model = modelLabel(t.model, modelNames);
    const project = projectsById.get(t.projectId);
    const title = threadTitle(t);
    const isOpen = openIds.has(t.id);
    return (
      <div key={t.id} className="slist-item">
        <Pressable className={`slist-row${isOpen ? " open" : ""}${t.id === focusedId ? " focused" : ""}`} aria-current={t.id === focusedId || undefined} onClick={() => onOpen(t.id)}>
          <span className={`slist-mark${mark ? ` ${mark}` : ""}`} role={mark ? "img" : undefined} aria-label={mark ? MARK_LABELS[mark] : undefined} aria-hidden={mark ? undefined : true}>
            {/* Same icons as the Notifications card: a dot would look like "running" with a yellow or red accent. */}
            {mark === "waiting" && <Icon name="user" />}
            {mark === "error" && <Icon name="alert" />}
          </span>
          <span className="slist-text">
            <span className="title-line">
              <span className="slist-title">{title}</span>
              <AutomationMark id={t.id} />
            </span>
            <span className="slist-meta">
              {relativeTime(t.lastActivityAt, now)}
              {/* Grouped rows sit under their project, so they name the model; flat rows name the project. */}
              {grouped && !settledRow
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
                  <Chevron open={open} className="slist-chevron" />
                  <ProjectIcon icon={g.project?.icon ?? null} title={g.title} />
                  <span className="slist-project-title">{g.title}</span>
                  <CountBadge count={g.badge} max={9} label={`${g.badge} running or unread`} />
                  <span className="slist-total" aria-label={`${g.threads.length} ${g.threads.length === 1 ? "session" : "sessions"}`}>{g.threads.length}</span>
                </Pressable>
                {newSession}
              </div>
              {open && g.threads.map((t) => row(t))}
            </section>
          );
        })
      : shown.map((t) => row(t));

  return (
    <aside className="slist" aria-label="Sessions list">
      <div className="slist-bar">
        <span className="slist-bar-title">Active</span>
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
        {(grouped ? projectGroups.length === 0 : shown.length === 0) && settled.length === 0 ? <p className="slist-empty">No sessions yet.</p> : groups}
      </div>
      {settled.length > 0 && (
        <section ref={settledPanel} className={`slist-settled${settledOpen ? " expanded" : ""}`} aria-label="Settled in the last 24 hours">
          <Pressable className="slist-project-toggle slist-settled-toggle" aria-expanded={settledOpen} onClick={() => setSettledOpen(!settledOpen)}>
            <Chevron open={settledOpen} className="slist-chevron" />
            <span className="slist-project-title">Settled · last 24h</span>
            <span className="slist-total">{settled.length}</span>
          </Pressable>
          <div className="slist-settled-body" inert={!settledOpen} aria-hidden={!settledOpen}>
            <div ref={settledContent} className="slist-settled-content">{settled.map((t) => row(t, true))}</div>
          </div>
        </section>
      )}
    </aside>
  );
}

// Memoized: SessionsView rerenders on every live event, and the list has a row per thread.
export const SessionList = memo(SessionListView);
