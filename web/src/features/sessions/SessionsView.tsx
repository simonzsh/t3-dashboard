import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import type { DashboardProject, DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import { threadState } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import { cellOf, spansRows, stepId, stripLayout, type SessionsAction, type SessionsState, type SessionWindow as Win } from "./sessions.ts";
import { enter, Kbd, Pressable, useFlip } from "../../ui/index.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import type { SessionLayout } from "../../lib/sessionLayout.ts";
import { ctrlLabel } from "../../lib/shortcuts.ts";
import { swipeDirection } from "../../lib/swipe.ts";
import { SessionWindow } from "./SessionWindow.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";

interface Props {
  sessions: SessionsState;
  dispatch: Dispatch<SessionsAction>;
  threads: DashboardThread[];
  projects: DashboardProject[];
  layout: SessionLayout;
  t3EnvironmentId: string | null;
  providers: DashboardProvider[];
}

/** Fixed-width columns in a strip that scrolls sideways; grid view stacks two sessions per column. */
export function SessionsStrip({ windows, layout, render }: { windows: Win[]; layout: SessionLayout; render: (w: Win) => ReactNode }) {
  const { rows } = stripLayout(windows.length, layout);
  // A move in the DOM resets the conversation scroll: cells stay sorted by id and only their coordinates change.
  const cells = windows.map((window, index) => ({ window, index, ...cellOf(index, layout) })).sort((a, b) => a.window.id.localeCompare(b.window.id));
  return (
    <div className="sessions-strip" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {cells.map(({ window, index, column, row }) => (
        <div
          key={window.id}
          className={`sessions-cell${row === 0 && rows > 1 && index + 1 < windows.length ? " has-below" : ""}`}
          style={{ gridColumn: column + 1, gridRow: spansRows(index, windows.length, layout) ? "1 / -1" : row + 1 }}
        >
          {render(window)}
        </div>
      ))}
    </div>
  );
}

/** A drag that starts in text or in a block that scrolls sideways (code, tables) is not a window swipe. */
function startsInHorizontalScroll(target: EventTarget | null, boundary: Element): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== boundary; el = el.parentElement) {
    if (el.matches("textarea, input, [contenteditable]")) return true;
    if (el.scrollWidth > el.clientWidth && /auto|scroll/.test(getComputedStyle(el).overflowX)) return true;
  }
  return false;
}

/** On a phone, a horizontal swipe moves to the next or previous window; the new one slides in from its side. */
function useWindowSwipe(enabled: boolean, windows: readonly Win[], activeId: string, dispatch: Dispatch<SessionsAction>) {
  const area = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef(activeId);
  const from = useRef<1 | -1>(1);
  useLayoutEffect(() => {
    if (shown.current === activeId) return;
    shown.current = activeId;
    const el = area.current?.firstElementChild;
    if (el) enter(el, { x: from.current * 32, duration: 200 });
  }, [activeId]);
  if (!enabled) return { area, swipe: {} };
  const swipe = {
    onTouchStart: (e: TouchEvent<HTMLDivElement>) => {
      const t = e.touches[0];
      start.current = e.touches.length === 1 && t && !startsInHorizontalScroll(e.target, e.currentTarget) ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: TouchEvent<HTMLDivElement>) => {
      const origin = start.current;
      const t = e.changedTouches[0];
      start.current = null;
      if (!origin || !t) return;
      const dir = swipeDirection(t.clientX - origin.x, t.clientY - origin.y);
      if (!dir) return;
      // Swiping left pulls the next window in from the right.
      const step = dir === "left" ? 1 : -1;
      const id = stepId(windows, activeId, step);
      if (!id) return;
      from.current = step;
      dispatch({ type: "focus", id });
    },
  };
  return { area, swipe };
}

// Below this distance a press on the header stays a click.
const DRAG_START_PX = 5;

/** Dragging a window by its header onto another window swaps their cells; a copy of the header follows the pointer. */
function useWindowDrag(enabled: boolean, dispatch: Dispatch<SessionsAction>) {
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  if (!enabled) return {};
  return {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      const target = e.target instanceof Element ? e.target : null;
      const head = target?.closest(".session-window-head");
      const win = head?.closest<HTMLElement>("[data-session-window]");
      if (e.button !== 0 || !e.isPrimary || !head || !win || win.classList.contains("maximized") || target?.closest("button, a")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const offset = head.getBoundingClientRect();
      let ghost: HTMLElement | null = null;
      let over: Element | null = null;
      // The pointer crosses the conversations while it drags: no text selection until the button is released.
      const noSelect = (ev: Event) => ev.preventDefault();
      const move = (ev: globalThis.PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START_PX) return;
          ghost = head.cloneNode(true) as HTMLElement;
          ghost.classList.add("sessions-drag-ghost");
          ghost.style.width = `${offset.width}px`;
          document.body.append(ghost);
          window.getSelection()?.removeAllRanges();
          win.classList.add("dragging");
          document.documentElement.classList.add("sessions-dragging");
        }
        ghost.style.transform = `translate(${offset.left + ev.clientX - startX}px, ${offset.top + ev.clientY - startY}px)`;
        const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-session-window]") ?? null;
        const next = hit && hit !== win ? hit : null;
        if (next === over) return;
        over?.classList.remove("drop-target");
        next?.classList.add("drop-target");
        over = next;
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", drop);
        window.removeEventListener("pointercancel", cleanup);
        document.removeEventListener("selectstart", noSelect);
        ghost?.remove();
        over?.classList.remove("drop-target");
        win.classList.remove("dragging");
        document.documentElement.classList.remove("sessions-dragging");
        stop.current = () => {};
      };
      const drop = () => {
        const into = over?.getAttribute("data-session-window");
        cleanup();
        if (into) dispatch({ type: "swap", id: win.getAttribute("data-session-window")!, with: into });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", drop);
      window.addEventListener("pointercancel", cleanup);
      document.addEventListener("selectstart", noSelect);
      stop.current = cleanup;
    },
  };
}

export function SessionsView({ sessions, dispatch, threads, projects, layout, t3EnvironmentId, providers }: Props) {
  const narrow = useMediaQuery("(max-width: 899px)");
  const byId = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  // Names of subagent threads, which the shell does not list.
  const [childTitles, setChildTitles] = useState<Record<string, string>>({});
  const setChildTitle = useCallback((id: string, title: string) => setChildTitles((titles) => (titles[id] === title ? titles : { ...titles, [id]: title })), []);
  const seen = useRef(new Set<string>());
  for (const w of sessions.windows) if (byId.has(w.id)) seen.current.add(w.id);
  const root = useRef<HTMLDivElement>(null);
  // Windows slide, open and close when the strip changes; the narrow view swaps tabs without motion.
  useFlip(root, `${narrow}|${layout}|${sessions.windows.map((w) => w.id).join(",")}|${sessions.maximizedId}`, { item: "data-session-window", enabled: !narrow });

  const activeId = (sessions.windows.find((w) => w.id === sessions.focusedId) ?? sessions.windows[0])?.id ?? "";
  const { area, swipe } = useWindowSwipe(narrow, sessions.windows, activeId, dispatch);
  const drag = useWindowDrag(!narrow && sessions.windows.length > 1 && !sessions.maximizedId, dispatch);

  // Keeps the open tab centered in the bar, whether a swipe or a tap changed it.
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = tabs.current;
    const tab = bar?.querySelector<HTMLElement>(".sessions-chip.active");
    if (!bar || !tab) return;
    const b = bar.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    bar.scrollTo({ left: bar.scrollLeft + t.left - b.left - (b.width - t.width) / 2, behavior: "smooth" });
  }, [narrow, activeId]);

  // A focused session that sits off screen scrolls into view, whether a key, a click or a new open focused it.
  useEffect(() => {
    if (narrow || !sessions.focusedId || sessions.maximizedId) return;
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    root.current?.querySelector(`[data-session-window="${CSS.escape(sessions.focusedId)}"]`)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior });
  }, [narrow, sessions.focusedId]);

  if (sessions.windows.length === 0) {
    return (
      <div ref={root} className="sessions">
        <div className="empty-state sessions-empty">
          <strong>No sessions open</strong>
          <span>Open one from Home, or start one with New Session.</span>
          <span className="shortcut-hint">
            Press <Kbd>{ctrlLabel("K")}</Kbd> to search every session.
          </span>
        </div>
      </div>
    );
  }

  const renderWindow = (w: Win, compact = false) => {
    const thread = byId.get(w.id) ?? null;
    const project = thread ? projectsById.get(thread.projectId) : undefined;
    // The key remounts the window when the narrow view switches tabs: no state leaks between threads.
    return (
      <SessionWindow
        key={w.id}
        id={w.id}
        thread={thread}
        projectTitle={project?.title ?? null}
        projectIcon={project?.icon ?? null}
        missing={!thread && seen.current.has(w.id)}
        focused={sessions.focusedId === w.id}
        maximized={!compact && sessions.maximizedId === w.id}
        compact={compact}
        t3EnvironmentId={t3EnvironmentId}
        providers={providers}
        childTitle={childTitles[w.id]}
        onTitle={setChildTitle}
        dispatch={dispatch}
      />
    );
  };

  const chip = (w: Win, active: boolean) => {
    const thread = byId.get(w.id);
    const project = thread ? projectsById.get(thread.projectId) : undefined;
    const title = thread || !childTitles[w.id] ? threadTitle(thread) : childTitles[w.id];
    return (
      <Pressable key={w.id} className={`sessions-chip${active ? " active" : ""}`} onClick={() => dispatch({ type: "focus", id: w.id })}>
        <span className={`state-dot ${thread ? threadState(thread) : "idle"}`} aria-hidden="true" />
        {project && <ProjectIcon icon={project.icon ?? null} title={project.title} />}
        <span className="sessions-chip-title" data-tooltip={title} data-tooltip-clipped>{title}</span>
      </Pressable>
    );
  };

  if (narrow) {
    const active = sessions.windows.find((w) => w.id === activeId)!;
    return (
      <div ref={root} className="sessions compact">
        <nav ref={tabs} className="sessions-tabs" aria-label="Open sessions">
          {sessions.windows.map((w) => chip(w, w.id === active.id))}
        </nav>
        <div ref={area} className="sessions-area" {...swipe}>
          {renderWindow(active, true)}
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className="sessions">
      <div className="sessions-area" {...drag}>
        <SessionsStrip windows={sessions.windows} layout={layout} render={(w) => renderWindow(w)} />
      </div>
    </div>
  );
}
