import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import type { DashboardProject, DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import { threadState } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import { cellOf, neighborId, NARROW_STRIP, perColumn, spansRows, type SessionsAction, type SessionsState } from "./sessions.ts";
import { focusSessionField, sessionWindowEl } from "./dom.ts";
import { enter, Kbd, Pressable, reducedMotion, useFlip } from "../../ui/index.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import type { SessionLayout } from "../../lib/sessionLayout.ts";
import { ctrlLabel, startsTyping } from "../../lib/shortcuts.ts";
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
export function SessionsStrip({ ids, layout, pinned = null, render }: { ids: readonly string[]; layout: SessionLayout; pinned?: string | null; render: (id: string, near: boolean) => ReactNode }) {
  const rows = Math.min(perColumn(layout), ids.length);
  const strip = useRef<HTMLDivElement>(null);
  // Cells within about one column of the viewport: the others skip their conversation (no fetch, no live reload).
  const [near, setNear] = useState<ReadonlySet<string>>(new Set());
  const idKey = ids.join(",");
  useEffect(() => {
    const root = strip.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) =>
        setNear((prev) => {
          const next = new Set(prev);
          for (const { target, isIntersecting } of entries) {
            const id = target.getAttribute("data-cell");
            if (id) isIntersecting ? next.add(id) : next.delete(id);
          }
          return next.size === prev.size && [...next].every((id) => prev.has(id)) ? prev : next;
        }),
      { root, rootMargin: "0px 400px" },
    );
    root.querySelectorAll(".sessions-cell").forEach((cell) => observer.observe(cell));
    return () => observer.disconnect();
  }, [idKey]);
  // A move in the DOM resets the conversation scroll: cells stay sorted by id and only their coordinates change.
  const cells = ids.map((id, index) => ({ id, index, ...cellOf(index, layout) })).sort((a, b) => a.id.localeCompare(b.id));
  return (
    <div ref={strip} className="sessions-strip" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {cells.map(({ id, index, column, row }) => (
        <div
          key={id}
          data-cell={id}
          className={`sessions-cell${row === 0 && rows > 1 && index + 1 < ids.length ? " has-below" : ""}`}
          style={{ gridColumn: column + 1, gridRow: spansRows(index, ids.length, layout) ? "1 / -1" : row + 1 }}
        >
          {render(id, near.has(id) || id === pinned)}
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
function useWindowSwipe(enabled: boolean, sessions: SessionsState, dispatch: Dispatch<SessionsAction>) {
  const activeId = sessions.focusedId ?? "";
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
      const id = neighborId(sessions, step === 1 ? "right" : "left", "columns");
      if (!id) return;
      from.current = step;
      dispatch({ type: "focus", id });
    },
  };
  return { area, swipe };
}

// Below this distance a press on the header stays a click.
const DRAG_START_PX = 5;
// A drag near the left or right edge of the strip scrolls it, so far columns can be reached.
const EDGE_PX = 40;
const EDGE_SPEED = 14;

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
      if (e.button !== 0 || !e.isPrimary || !head || !win || target?.closest("button, a")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const offset = head.getBoundingClientRect();
      let ghost: HTMLElement | null = null;
      let over: Element | null = null;
      let pointer = { x: startX, y: startY };
      let frame = 0;
      const strip = win.closest<HTMLElement>(".sessions-strip");
      const hover = () => {
        const hit = document.elementFromPoint(pointer.x, pointer.y)?.closest("[data-session-window]") ?? null;
        const next = hit && hit !== win ? hit : null;
        if (next === over) return;
        over?.classList.remove("drop-target");
        next?.classList.add("drop-target");
        over = next;
      };
      const autoScroll = () => {
        frame = requestAnimationFrame(autoScroll);
        if (!strip) return;
        const b = strip.getBoundingClientRect();
        const dir = pointer.x < b.left + EDGE_PX ? -1 : pointer.x > b.right - EDGE_PX ? 1 : 0;
        if (!dir) return;
        const before = strip.scrollLeft;
        strip.scrollLeft += dir * EDGE_SPEED;
        if (strip.scrollLeft !== before) hover();
      };
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
          frame = requestAnimationFrame(autoScroll);
        }
        pointer = { x: ev.clientX, y: ev.clientY };
        ghost.style.transform = `translate(${offset.left + ev.clientX - startX}px, ${offset.top + ev.clientY - startY}px)`;
        hover();
      };
      const cleanup = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", drop);
        window.removeEventListener("pointercancel", cleanup);
        document.removeEventListener("selectstart", noSelect);
        cancelAnimationFrame(frame);
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
  const narrow = useMediaQuery(NARROW_STRIP);
  const byId = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);
  const projectsById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  // Names of subagent threads, which the shell does not list.
  const [childTitles, setChildTitles] = useState<Record<string, string>>({});
  const setChildTitle = useCallback((id: string, title: string) => setChildTitles((titles) => (titles[id] === title ? titles : { ...titles, [id]: title })), []);
  const seen = useRef(new Set<string>());
  for (const id of sessions.ids) if (byId.has(id)) seen.current.add(id);
  const root = useRef<HTMLDivElement>(null);
  const { focusedId, maximized } = sessions;
  // Windows slide, open and close when the strip changes; the narrow view swaps tabs without motion.
  useFlip(root, `${layout}|${sessions.ids.join(",")}|${maximized}`, { item: "data-session-window", enabled: !narrow });

  const activeId = focusedId ?? "";
  const { area, swipe } = useWindowSwipe(narrow, sessions, dispatch);
  const drag = useWindowDrag(!narrow && sessions.ids.length > 1 && !maximized, dispatch);

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

  // A press focuses its window here: the pointer is already on it, so that focus must not scroll.
  const pressFocus = useRef(false);
  const onPressCapture = (e: PointerEvent<HTMLDivElement>) => {
    const id = e.target instanceof Element ? e.target.closest("[data-session-window]")?.getAttribute("data-session-window") : null;
    if (!id || id === focusedId) return;
    pressFocus.current = true;
    dispatch({ type: "focus", id });
  };
  // A focused session that sits off screen scrolls into view after a key, an open or a layout change, never after a press.
  useEffect(() => {
    const byPointer = pressFocus.current;
    pressFocus.current = false;
    if (byPointer || narrow || !focusedId || maximized) return;
    sessionWindowEl(focusedId)?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: reducedMotion() ? "auto" : "smooth" });
  }, [narrow, focusedId, maximized, layout]);

  // Shortcuts use Ctrl, so a plain character typed outside a field goes to the focused session's message field.
  useEffect(() => {
    if (!focusedId) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (!startsTyping({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: el })) return;
      // Focused during keydown: the browser then types this key into the field.
      if (!el?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) focusSessionField(focusedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId]);

  if (sessions.ids.length === 0) {
    return (
      <div ref={root} className="sessions">
        <div className="empty-state sessions-empty">
          <strong>No sessions open</strong>
          <span>Open one from Dashboard, or start one with New Session.</span>
          <span className="shortcut-hint">
            Press <Kbd>{ctrlLabel("K")}</Kbd> to search every session.
          </span>
        </div>
      </div>
    );
  }

  const info = (id: string) => {
    const thread = byId.get(id) ?? null;
    const project = thread ? projectsById.get(thread.projectId) : undefined;
    return { thread, project, title: thread || !childTitles[id] ? threadTitle(thread) : childTitles[id] };
  };

  const renderWindow = (id: string, compact = false, live = true) => {
    const { thread, project, title } = info(id);
    // The key remounts the window when the narrow view switches tabs: no state leaks between threads.
    return (
      <SessionWindow
        key={id}
        id={id}
        thread={thread}
        title={title}
        projectTitle={project?.title ?? null}
        projectIcon={project?.icon ?? null}
        missing={!thread && seen.current.has(id)}
        focused={focusedId === id}
        maximized={!compact && maximized && focusedId === id}
        compact={compact}
        live={live}
        t3EnvironmentId={t3EnvironmentId}
        providers={providers}
        onTitle={setChildTitle}
        dispatch={dispatch}
      />
    );
  };

  const chip = (id: string) => {
    const { thread, project, title } = info(id);
    return (
      <Pressable key={id} className={`sessions-chip${id === activeId ? " active" : ""}`} onClick={() => dispatch({ type: "focus", id })}>
        <span className={`state-dot ${thread ? threadState(thread) : "idle"}`} aria-hidden="true" />
        {project && <ProjectIcon icon={project.icon ?? null} title={project.title} />}
        <span className="sessions-chip-title" data-tooltip={title} data-tooltip-clipped>{title}</span>
      </Pressable>
    );
  };

  if (narrow) {
    return (
      <div ref={root} className="sessions compact">
        <nav ref={tabs} className="sessions-tabs" aria-label="Open sessions">
          {sessions.ids.map(chip)}
        </nav>
        <div ref={area} className="sessions-area" {...swipe}>
          {renderWindow(activeId, true)}
        </div>
      </div>
    );
  }

  return (
    <div ref={root} className="sessions">
      <div className="sessions-area" onPointerDownCapture={onPressCapture} {...drag}>
        <SessionsStrip ids={sessions.ids} layout={layout} pinned={focusedId} render={(id, near) => renderWindow(id, false, near)} />
      </div>
    </div>
  );
}
