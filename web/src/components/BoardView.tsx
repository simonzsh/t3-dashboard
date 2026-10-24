import { useCallback, useEffect, useMemo, useState } from "react";
import type { BoardResult } from "../../../shared/api.ts";
import { api } from "../api.ts";
import { groupBoard } from "../board.ts";
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

  const groups = useMemo(() => groupBoard(board?.issues ?? []), [board]);
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
      {board && groups.length === 0 && broken.length === 0 && (
        <div className="empty-state">
          <strong>Aucun ticket assigné</strong>
          <span>Les tickets ouverts qui vous sont assignés apparaissent ici.</span>
        </div>
      )}
      {groups.map((g) => (
        <section className="group" key={g.key}>
          <h2>
            {g.title} <span className="workspace">{g.workspace}</span> <span className="count">{g.issues.length}</span>
          </h2>
          <ul className="issues">
            {g.issues.map((i) => (
              <li className="issue" key={i.id}>
                <a href={i.url} target="_blank" rel="noreferrer" className="issue-link">
                  <span className="dot" style={{ background: i.state.color }} title={i.state.name} />
                  <span className="ident">{i.identifier}</span>
                  <span className="issue-title">{i.title}</span>
                  <span className="issue-state">{i.state.name}</span>
                  {i.priority > 0 && <span className={`prio p${i.priority}`}>{i.priorityLabel}</span>}
                </a>
                <AssignMenu issue={i} onShowAgents={onShowAgents} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
