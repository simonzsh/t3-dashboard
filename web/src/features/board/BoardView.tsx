import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardResult, DashboardProject, DashboardProvider, ModelDefaults } from "../../../../shared/api.ts";
import { useApi } from "../../api/ApiContext.tsx";
import { boardColumns } from "./board.ts";
import { boardNeedsKey, linearConnected } from "../settings/linearSettings.ts";
import { Icon, IconButton, Loader, Pressable } from "../../ui/index.ts";
import { AssignMenu } from "./AssignMenu.tsx";
import { LinearSetupCard } from "./LinearSetupCard.tsx";
import { PriorityIcon } from "./PriorityIcon.tsx";
import { useNotify } from "../../lib/notices.tsx";
import { useAction } from "../../lib/useAction.ts";
import { useMediaQuery } from "../../lib/useMediaQuery.ts";
import { usePanes } from "../../lib/usePanes.ts";

interface Props {
  projects: DashboardProject[];
  providers: DashboardProvider[];
  modelDefaults: ModelDefaults;
  /** Changes when the Linear settings change: the board then loads again. */
  version: number;
  onAssigned: (threadId: string) => void;
  onShowDesk: () => void;
}

export function BoardView({ projects, providers, modelDefaults, version, onAssigned, onShowDesk }: Props) {
  const api = useApi();
  const [board, setBoard] = useState<BoardResult | null>(null);
  const { busy: loading, error, run } = useAction("load the board");

  const load = useCallback((refresh: boolean) => run(async () => setBoard(await api.getBoard(refresh))), []);

  useEffect(() => {
    void load(version > 0);
  }, [load, version]);

  const columns = useMemo(() => boardColumns(board?.issues ?? []), [board]);
  const phone = useMediaQuery("(max-width: 700px)");
  const columnNames = useMemo(() => columns.map((c) => c.name), [columns]);
  const { pane, show, layout, swipe } = usePanes(columnNames, phone && columns.length > 1);
  const shown = pane ? columns.filter((c) => c.name === pane) : columns;
  const needsKey = board !== null && boardNeedsKey(board);
  const linearError = board && !needsKey && !board.ok ? board.error : null;
  const notify = useNotify();
  useEffect(() => {
    if (linearError) notify(`Linear returned an error: ${linearError}`);
  }, [linearError]);

  return (
    <div className="board" {...swipe}>
      <div className="toolbar">
        {board && linearConnected(board) && (
          <span className="linear-source">
            <span className="conn-dot" aria-hidden="true" /> Connected to Linear
          </span>
        )}
        <IconButton label="Refresh" tooltip="Refresh data from Linear" className="refresh" aria-busy={loading} disabled={loading} onClick={() => void load(true)}>
          <Icon name="refresh" className={`icon${loading ? " spinning" : ""}`} />
        </IconButton>
      </div>
      {!board && !error && <Loader />}
      {!board && error && <p className="empty">The board could not be loaded.</p>}
      {board && needsKey && <LinearSetupCard refused={board.configured} onConnected={() => void load(true)} />}
      {board && !needsKey && columns.length === 0 && !linearError && (
        <div className="empty-state">
          <strong>No assigned issues</strong>
          <span>Open issues assigned to you appear here.</span>
        </div>
      )}
      {columns.length > 0 && (
        <div ref={layout} className="kanban">
          {shown.map((col) => (
            <section className="column" key={col.name}>
              <h2 className="column-head">
                <span className="dot" style={{ background: col.color }} />
                {col.name} <span className="count">{col.count}</span>
              </h2>
              <div className="column-body">
                {col.groups.map((g) => (
                  <div className="subgroup" key={g.key}>
                    <h3>
                      {g.title} <span className="workspace">{g.team}</span> <span className="count">{g.issues.length}</span>
                    </h3>
                    {g.issues.map((i) => (
                      <article className="card" key={i.id}>
                        <span className="card-meta">
                          <PriorityIcon priority={i.priority} label={i.priorityLabel} />
                          <span className="ident">{i.identifier}</span>
                        </span>
                        <a href={i.url} target="_blank" rel="noreferrer" className="card-title" data-tooltip={i.title} data-tooltip-clipped>
                          {i.title}
                        </a>
                        <AssignMenu issue={i} projects={projects} providers={providers} modelDefaults={modelDefaults} onAssigned={onAssigned} onShowDesk={onShowDesk} />
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {pane && (
        <nav className="pane-dots" aria-label="Columns">
          {columns.map((c) => (
            <Pressable key={c.name} className={c.name === pane ? "active" : ""} aria-label={c.name} aria-current={c.name === pane ? "page" : undefined} onClick={() => show(c.name)} />
          ))}
        </nav>
      )}
    </div>
  );
}
