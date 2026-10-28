import { useEffect, useLayoutEffect, useMemo, useRef, type Dispatch, type MouseEvent, type PointerEvent, type ReactNode, type TouchEvent } from "react";
import { Cell, Grid, Gridline, useGridRef, type GridLayout } from "react-resizable-panels";
import type { DashboardProject, DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import { threadState } from "../../../../shared/status.ts";
import { threadTitle } from "../../lib/threads.ts";
import type { DeskBackground } from "./deskBackground.ts";
import { cellOf, deskLayout, equalSizes, gridWindows, sizesFor, stepId, type DeskAction, type DeskState, type DeskWindow as Win } from "./desk.ts";
import { enter, Icon, IconButton, Kbd, Pressable, useFlip } from "../../ui/index.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { swipeDirection } from "../../lib/swipe.ts";
import { DeskWindow } from "./DeskWindow.tsx";
import { ProviderIcon } from "../../lib/ProviderIcon.tsx";

interface Props {
  desk: DeskState;
  dispatch: Dispatch<DeskAction>;
  threads: DashboardThread[];
  projects: DashboardProject[];
  background: DeskBackground;
  t3EnvironmentId: string | null;
  providers: DashboardProvider[];
}

const MIN_COLUMN_PX = 220;
const MIN_ROW_PX = 160;

function DeskGrid({ windows, desk, dispatch, render }: { windows: Win[]; desk: DeskState; dispatch: Dispatch<DeskAction>; render: (w: Win) => ReactNode }) {
  const count = windows.length;
  const { columns, rows } = deskLayout(count);
  const gridRef = useGridRef();
  const sizes = sizesFor(desk, count);
  const columnTracks = useMemo(() => Array.from({ length: columns }, (_, i) => ({ id: `c${i}`, minSize: MIN_COLUMN_PX })), [columns]);
  const rowTracks = useMemo(() => Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, minSize: MIN_ROW_PX })), [rows]);

  // Tracks change with the window count: apply the sizes kept for the new layout.
  useEffect(() => {
    gridRef.current?.setLayout(sizes);
  }, [count]);

  const save = (layout: GridLayout) => dispatch({ type: "setSizes", count, sizes: layout });

  function resetOnDoubleClick(e: MouseEvent<HTMLDivElement>) {
    const separator = e.target instanceof Element ? e.target.closest("[data-separator]") : null;
    if (!separator || !gridRef.current) return;
    const vertical = separator.getAttribute("aria-orientation") === "vertical";
    save(gridRef.current.setLayout(vertical ? { columns: equalSizes("c", columns) } : { rows: equalSizes("r", rows) }));
  }

  return (
    <Grid
      className="desk-grid"
      // The library clips the grid and its cells: that cut the window shadows into square boxes.
      style={{ overflow: "visible" }}
      gridRef={gridRef}
      columns={columnTracks}
      rows={rowTracks}
      defaultLayout={sizes}
      onLayoutChanged={(layout, meta) => {
        if (meta.isUserInteraction) save(meta.requestedLayout ?? layout);
      }}
      onDoubleClick={resetOnDoubleClick}
    >
      {windows.map((w, i) => (
        <Cell key={w.id} className="desk-cell" style={{ overflow: "visible" }} {...cellOf(i, columns)}>
          {render(w)}
        </Cell>
      ))}
      {Array.from({ length: columns - 1 }, (_, i) => (
        <Gridline key={`c${i + 1}`} type="column" column={i + 1} className="desk-gutter" />
      ))}
      {rows > 1 && <Gridline type="row" row={1} className="desk-gutter" />}
    </Grid>
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
function useWindowSwipe(enabled: boolean, windows: readonly Win[], activeId: string, dispatch: Dispatch<DeskAction>) {
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
      dispatch({ type: "restore", id });
    },
  };
  return { area, swipe };
}

// Below this distance a press on the header stays a click.
const DRAG_START_PX = 5;

/** Dragging a window by its header onto another window swaps their cells; a copy of the header follows the pointer. */
function useWindowDrag(enabled: boolean, dispatch: Dispatch<DeskAction>) {
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  if (!enabled) return {};
  return {
    onPointerDown: (e: PointerEvent<HTMLDivElement>) => {
      const target = e.target instanceof Element ? e.target : null;
      const head = target?.closest(".desk-window-head");
      const win = head?.closest<HTMLElement>("[data-desk-window]");
      if (e.button !== 0 || !e.isPrimary || !head || !win || win.classList.contains("maximized") || target?.closest("button, a")) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const offset = head.getBoundingClientRect();
      let ghost: HTMLElement | null = null;
      let over: Element | null = null;
      const move = (ev: globalThis.PointerEvent) => {
        if (!ghost) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_START_PX) return;
          ghost = head.cloneNode(true) as HTMLElement;
          ghost.classList.add("desk-drag-ghost");
          ghost.style.width = `${offset.width}px`;
          document.body.append(ghost);
          win.classList.add("dragging");
          document.documentElement.classList.add("desk-dragging");
        }
        ghost.style.transform = `translate(${offset.left + ev.clientX - startX}px, ${offset.top + ev.clientY - startY}px)`;
        const hit = document.elementFromPoint(ev.clientX, ev.clientY)?.closest("[data-desk-window]") ?? null;
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
        ghost?.remove();
        over?.classList.remove("drop-target");
        win.classList.remove("dragging");
        document.documentElement.classList.remove("desk-dragging");
        stop.current = () => {};
      };
      const drop = () => {
        const into = over?.getAttribute("data-desk-window");
        cleanup();
        if (into) dispatch({ type: "swap", id: win.getAttribute("data-desk-window")!, with: into });
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", drop);
      window.addEventListener("pointercancel", cleanup);
      stop.current = cleanup;
    },
  };
}

export function DeskView({ desk, dispatch, threads, projects, background, t3EnvironmentId, providers }: Props) {
  const narrow = useMediaQuery("(max-width: 899px)");
  const byId = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);
  const projectTitles = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects]);
  const seen = useRef(new Set<string>());
  for (const w of desk.windows) if (byId.has(w.id)) seen.current.add(w.id);
  const root = useRef<HTMLDivElement>(null);
  const visible = gridWindows(desk);
  // Windows slide, open, close and fly to the dock when the grid changes; the narrow view swaps tabs without motion.
  useFlip(root, `${narrow}|${visible.map((w) => w.id).join(",")}|${desk.maximizedId}`, { item: "data-desk-window", origin: "data-desk-chip", enabled: !narrow });

  const activeId = (desk.windows.find((w) => w.id === desk.focusedId) ?? desk.windows[0])?.id ?? "";
  const { area, swipe } = useWindowSwipe(narrow, desk.windows, activeId, dispatch);
  const drag = useWindowDrag(!narrow && visible.length > 1 && !desk.maximizedId, dispatch);

  // Keeps the open tab centered in the bar, whether a swipe or a tap changed it.
  const tabs = useRef<HTMLElement>(null);
  useEffect(() => {
    const bar = tabs.current;
    const tab = bar?.querySelector<HTMLElement>(".desk-chip.active");
    if (!bar || !tab) return;
    const b = bar.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    bar.scrollTo({ left: bar.scrollLeft + t.left - b.left - (b.width - t.width) / 2, behavior: "smooth" });
  }, [narrow, activeId]);

  const bgClass = background.kind === "preset" ? ` desk-bg-${background.id} has-bg` : background.kind === "image" ? " has-bg" : "";
  const bgStyle = background.kind === "image" ? { backgroundImage: `url("${background.dataUrl}")` } : undefined;

  if (desk.windows.length === 0) {
    return (
      <div ref={root} className={`desk${bgClass}`} style={bgStyle}>
        <div className="empty-state desk-empty">
          <strong>Your Desk is empty</strong>
          <span>Click an agent card to open it here, or use its + button to add it without leaving the list.</span>
          <span className="shortcut-hint">
            Press <Kbd>1</Kbd> to go back to the agents.
          </span>
        </div>
      </div>
    );
  }

  const renderWindow = (w: Win, compact = false) => {
    const thread = byId.get(w.id) ?? null;
    // The key remounts the window when the narrow view switches tabs: no state leaks between threads.
    return (
      <DeskWindow
        key={w.id}
        id={w.id}
        thread={thread}
        projectTitle={thread ? (projectTitles.get(thread.projectId) ?? null) : null}
        missing={!thread && seen.current.has(w.id)}
        focused={desk.focusedId === w.id}
        maximized={!compact && desk.maximizedId === w.id}
        compact={compact}
        t3EnvironmentId={t3EnvironmentId}
        providers={providers}
        dispatch={dispatch}
      />
    );
  };

  const chip = (w: Win, active: boolean, closable = false) => {
    const thread = byId.get(w.id);
    const button = (
      <Pressable
        key={w.id}
        className={`desk-chip${active ? " active" : ""}`}
        data-desk-chip={closable ? w.id : undefined}
        onClick={() => dispatch({ type: "restore", id: w.id })}
      >
        <span className={`state-dot ${thread ? threadState(thread) : "idle"}`} aria-hidden="true" />
        {thread && <ProviderIcon provider={thread.provider} />}
        <span className="desk-chip-title" data-tooltip={threadTitle(thread)} data-tooltip-clipped>{threadTitle(thread)}</span>
      </Pressable>
    );
    if (!closable) return button;
    // A sibling, not a child: a button cannot hold another button.
    return (
      <span key={w.id} className="desk-chip-wrap">
        {button}
        <IconButton size="sm" variant="ghost" className="desk-chip-close" label="Remove from Desk" tooltip="Remove from Desk" onClick={() => dispatch({ type: "close", id: w.id })}>
          <Icon name="x" />
        </IconButton>
      </span>
    );
  };

  if (narrow) {
    const active = desk.windows.find((w) => w.id === activeId)!;
    return (
      <div ref={root} className={`desk compact${bgClass}`} style={bgStyle}>
        <nav ref={tabs} className="desk-tabs" aria-label="Desk windows">
          {desk.windows.map((w) => chip(w, w.id === active.id))}
        </nav>
        <div ref={area} className="desk-area" {...swipe}>
          {renderWindow(active, true)}
        </div>
      </div>
    );
  }

  const minimized = desk.windows.filter((w) => w.minimized);
  return (
    <div ref={root} className={`desk${bgClass}`} style={bgStyle}>
      <div className="desk-area" {...drag}>
        {visible.length > 0 ? (
          <DeskGrid windows={visible} desk={desk} dispatch={dispatch} render={(w) => renderWindow(w)} />
        ) : (
          <div className="empty-state desk-empty">
            <strong>All windows are minimized</strong>
            <span>Click a window in the bar below to restore it.</span>
          </div>
        )}
      </div>
      {minimized.length > 0 && (
        <nav className="desk-dock" aria-label="Minimized windows">
          {minimized.map((w) => chip(w, false, true))}
        </nav>
      )}
    </div>
  );
}
