import { useEffect, useMemo, useState } from "react";
import { Board } from "./components/Board.tsx";
import { Charts } from "./components/Charts.tsx";
import { ConnectionBanner } from "./components/ConnectionBanner.tsx";
import { FiltersBar } from "./components/FiltersBar.tsx";
import { Kpis } from "./components/Kpis.tsx";
import { filterThreads, type Filters } from "./filters.ts";
import { useDashboard } from "./useDashboard.ts";

export function App() {
  const { state, sseDown } = useDashboard();
  const [filters, setFilters] = useState<Filters>({ projectId: null, provider: null, search: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // Relative times and the 30-day window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const threads = useMemo(() => (state ? filterThreads(state.threads, filters) : []), [state, filters]);

  return (
    <div className="app">
      <header className="topbar">
        <h1>T3 Dashboard</h1>
        {state && <FiltersBar filters={filters} onChange={setFilters} projects={state.projects} threads={state.threads} onNewThread={() => {}} />}
      </header>
      <ConnectionBanner connection={state?.connection ?? null} sseDown={sseDown} />
      {!state ? (
        <p className="empty">Chargement…</p>
      ) : (
        <main>
          <Kpis threads={threads} />
          <Charts threads={threads} projects={state.projects} now={now} />
          <Board threads={threads} projects={state.projects} now={now} selectedId={selectedId} onOpen={setSelectedId} />
        </main>
      )}
    </div>
  );
}
