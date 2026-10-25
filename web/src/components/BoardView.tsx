import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardResult, DashboardProject } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { boardColumns } from "../board.ts";
import { boardNeedsKey, linearConnected } from "../linearSettings.ts";
import { Icon } from "./Icon.tsx";
import { AssignMenu } from "./AssignMenu.tsx";
import { LinearSetupCard } from "./LinearSetupCard.tsx";

interface Props {
  projects: DashboardProject[];
  /** Changes when the Linear settings change: the board then loads again. */
  version: number;
  onAssigned: (threadId: string) => void;
  onShowDesk: () => void;
}

export function BoardView({ projects, version, onAssigned, onShowDesk }: Props) {
  const [board, setBoard] = useState<BoardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setBoard(await api.getBoard(refresh));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(version > 0);
  }, [load, version]);

  const columns = useMemo(() => boardColumns(board?.issues ?? []), [board]);
  const needsKey = board !== null && boardNeedsKey(board);
  const broken = needsKey ? [] : (board?.workspaces.filter((w) => !w.ok) ?? []);

  return (
    <div className="board">
      <div className="toolbar">
        {board && linearConnected(board) && (
          <span className="linear-source">
            <span className="conn-dot" aria-hidden="true" /> Connected to Linear
          </span>
        )}
        <button className="icon-button refresh" aria-label="Refresh" title="Refresh" aria-busy={loading} disabled={loading} onClick={() => void load(true)}>
          <Icon name="refresh" className={`icon${loading ? " spinning" : ""}`} />
        </button>
      </div>
      {error && <p className="notice error-notice">{error}</p>}
      {broken.map((w) => (
        <p className="notice" key={w.name}>
          <strong>{w.name}</strong> : {w.error ?? "Missing API key"}
        </p>
      ))}
      {!board && !error && <p className="empty">Loading…</p>}
      {board && needsKey && <LinearSetupCard refused={board.configured} onConnected={() => void load(true)} />}
      {board && !needsKey && columns.length === 0 && broken.length === 0 && (
        <div className="empty-state">
          <strong>No assigned issues</strong>
          <span>Open issues assigned to you appear here.</span>
        </div>
      )}
      {columns.length > 0 && (
        <div className="kanban">
          {columns.map((col) => (
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
                        <a href={i.url} target="_blank" rel="noreferrer" className="card-link">
                          <span className="card-top">
                            <span className="ident">{i.identifier}</span>
                            {i.priority > 0 && <span className={`prio p${i.priority}`}>{i.priorityLabel}</span>}
                          </span>
                          <span className="card-title">{i.title}</span>
                        </a>
                        <AssignMenu issue={i} projects={projects} onAssigned={onAssigned} onShowDesk={onShowDesk} />
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
