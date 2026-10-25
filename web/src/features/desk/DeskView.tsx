import { useEffect, useRef, type Dispatch, type MouseEvent, type ReactNode } from "react";
import { Cell, Grid, Gridline, useGridRef, type GridLayout } from "react-resizable-panels";
import type { DashboardProject, DashboardProvider, DashboardThread } from "../../../../shared/api.ts";
import { threadState } from "../../../../shared/status.ts";
import type { DeskBackground } from "./deskBackground.ts";
import { cellOf, deskLayout, equalSizes, gridWindows, sizesFor, type DeskAction, type DeskState, type DeskWindow as Win } from "./desk.ts";
import { Kbd, Pressable } from "../../ui/index.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
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
      columns={Array.from({ length: columns }, (_, i) => ({ id: `c${i}`, minSize: MIN_COLUMN_PX }))}
      rows={Array.from({ length: rows }, (_, i) => ({ id: `r${i}`, minSize: MIN_ROW_PX }))}
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

export function DeskView({ desk, dispatch, threads, projects, background, t3EnvironmentId, providers }: Props) {
  const narrow = useMediaQuery("(max-width: 899px)");
  const byId = new Map(threads.map((t) => [t.id, t]));
  const projectTitles = new Map(projects.map((p) => [p.id, p.title]));
  const seen = useRef(new Set<string>());
  for (const w of desk.windows) if (byId.has(w.id)) seen.current.add(w.id);

  const bgClass = background.kind === "preset" ? ` desk-bg-${background.id} has-bg` : background.kind === "image" ? " has-bg" : "";
  const bgStyle = background.kind === "image" ? { backgroundImage: `url("${background.dataUrl}")` } : undefined;

  if (desk.windows.length === 0) {
    return (
      <div className={`desk${bgClass}`} style={bgStyle}>
        <div className="empty-state desk-empty">
          <strong>Your Desk is empty</strong>
          <span>Click an agent card to open it here, or use its + button to add it without leaving the list.</span>
          <span>
            Press <Kbd>1</Kbd> to go back to the agents.
          </span>
        </div>
      </div>
    );
  }

  const renderWindow = (w: Win, compact = false) => {
    const thread = byId.get(w.id) ?? null;
    return (
      <DeskWindow
        id={w.id}
        thread={thread}
        projectTitle={thread ? (projectTitles.get(thread.projectId) ?? null) : null}
        missing={!thread && seen.current.has(w.id)}
        focused={desk.focusedId === w.id}
        maximized={!compact && desk.maximizedId === w.id}
        compact={compact}
        t3EnvironmentId={t3EnvironmentId}
        providers={providers}
        onFocus={() => dispatch({ type: "focus", id: w.id })}
        onClose={() => dispatch({ type: "close", id: w.id })}
        onMinimize={() => dispatch({ type: "minimize", id: w.id })}
        onToggleMaximize={() => dispatch({ type: "maximize", id: w.id })}
      />
    );
  };

  const chip = (w: Win, active: boolean) => {
    const thread = byId.get(w.id);
    return (
      <Pressable key={w.id} className={`desk-chip${active ? " active" : ""}`} title={thread?.title || "(untitled)"} onClick={() => dispatch({ type: "restore", id: w.id })}>
        <span className={`state-dot ${thread ? threadState(thread) : "idle"}`} aria-hidden="true" />
        {thread && <ProviderIcon provider={thread.provider} />}
        <span className="desk-chip-title">{thread?.title || "(untitled)"}</span>
      </Pressable>
    );
  };

  if (narrow) {
    const active = desk.windows.find((w) => w.id === desk.focusedId) ?? desk.windows[0]!;
    return (
      <div className={`desk compact${bgClass}`} style={bgStyle}>
        <nav className="desk-tabs" aria-label="Desk windows">
          {desk.windows.map((w) => chip(w, w.id === active.id))}
        </nav>
        <div className="desk-area">{renderWindow(active, true)}</div>
      </div>
    );
  }

  const visible = gridWindows(desk);
  const minimized = desk.windows.filter((w) => w.minimized);
  return (
    <div className={`desk${bgClass}`} style={bgStyle}>
      <div className="desk-area">
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
          {minimized.map((w) => chip(w, false))}
        </nav>
      )}
    </div>
  );
}
