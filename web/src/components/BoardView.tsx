import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardResult } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { boardColumns } from "../board.ts";
import { AssignMenu } from "./AssignMenu.tsx";

export function BoardView({ onShowAgents }: { onShowAgents: () => void }) {
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
    void load(false);
  }, [load]);

  const columns = useMemo(() => boardColumns(board?.issues ?? []), [board]);
  const broken = board?.workspaces.filter((w) => !w.ok) ?? [];

  return (
    <>
      <div className="toolbar">
        <button disabled={loading} onClick={() => void load(true)}>
          {loading ? "Chargement…" : "Rafraîchir"}
        </button>
      </div>
      {error && <p className="notice error-notice">{error}</p>}
      {broken.map((w) => (
        <p className="notice" key={w.name}>
          <strong>{w.name}</strong> : {w.error ?? "Clé API manquante"}
        </p>
      ))}
      {!board && !error && <p className="empty">Chargement…</p>}
      {board && columns.length === 0 && broken.length === 0 && (
        <div className="empty-state">
          <strong>Aucun ticket assigné</strong>
          <span>Les tickets ouverts qui vous sont assignés apparaissent ici.</span>
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
                        <AssignMenu issue={i} onShowAgents={onShowAgents} />
                      </article>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
