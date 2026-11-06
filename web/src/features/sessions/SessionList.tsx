import { useMemo } from "react";
import type { DashboardProject, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { relativeTime } from "../../lib/format.ts";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { threadTitle } from "../../lib/threads.ts";
import { Button, Icon, IconButton, Pressable } from "../../ui/index.ts";
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
  onCloseAll: () => void;
}

/** Every listed thread, by project or by recent activity: a click opens it as a session. */
export function SessionList({ threads, projects, seen, modelNames, now, openIds, focusedId, prefs, onPrefs, onOpen, onNewSession, onCloseAll }: Props) {
  const shown = useMemo(() => listableThreads(threads), [threads]);
  const collapsed = new Set(prefs.collapsed);

  const row = (t: DashboardThread) => {
    const mark = statusMark(t, seen);
    const model = t.model ? (modelNames.get(t.model) ?? t.model) : null;
    const title = threadTitle(t);
    return (
      <Pressable key={t.id} className={`slist-row${openIds.has(t.id) ? " open" : ""}${t.id === focusedId ? " focused" : ""}`} aria-current={t.id === focusedId || undefined} onClick={() => onOpen(t.id)}>
        <span className={`slist-mark${mark ? ` ${mark}` : ""}`} role={mark ? "img" : undefined} aria-label={mark ? MARK_LABELS[mark] : undefined} aria-hidden={mark ? undefined : true} />
        <span className="slist-text">
          <span className="slist-title" data-tooltip={title} data-tooltip-clipped>
            {title}
          </span>
          <span className="slist-meta">{[relativeTime(t.lastActivityAt, now), model].filter(Boolean).join(" · ")}</span>
        </span>
      </Pressable>
    );
  };

  const groups =
    prefs.mode === "grouped"
      ? groupByProject(shown, projects, seen).map((g) => {
          const open = !collapsed.has(g.id);
          const toggle = () => onPrefs({ collapsed: open ? [...prefs.collapsed, g.id] : prefs.collapsed.filter((id) => id !== g.id) });
          return (
            <section key={g.id} className="slist-group" aria-label={g.title}>
              <div className="slist-project">
                <Pressable className="slist-project-toggle" aria-expanded={open} onClick={toggle}>
                  <Icon name={open ? "chevron" : "chevronRight"} className="icon slist-chevron" />
                  <ProjectIcon icon={g.project?.icon ?? null} title={g.title} />
                  <span className="slist-project-title">{g.title}</span>
                  {g.running > 0 && <span className="slist-count running" aria-label={`${g.running} running`}>{g.running}</span>}
                  {g.unread > 0 && <span className="slist-count" aria-label={`${g.unread} unread`}>{g.unread}</span>}
                </Pressable>
                {g.project && (
                  <IconButton variant="ghost" size="sm" className="slist-new" label={`New session in ${g.title}`} tooltip="New session here" onClick={() => onNewSession(g.id)}>
                    <Icon name="plus" />
                  </IconButton>
                )}
              </div>
              {open && g.threads.map(row)}
            </section>
          );
        })
      : shown.map(row);

  return (
    <aside className="slist" aria-label="Sessions list">
      <div className="slist-body">
        {shown.length === 0 ? <p className="slist-empty">No sessions yet.</p> : groups}
      </div>
      <div className="slist-foot">
        <Button variant="ghost" size="sm" disabled={openIds.size === 0} onClick={onCloseAll}>
          <Icon name="x" /> Close all
        </Button>
      </div>
    </aside>
  );
}
