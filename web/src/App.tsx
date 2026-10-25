import { useEffect, useState } from "react";
import { AgentsView } from "./components/AgentsView.tsx";
import { BoardView } from "./components/BoardView.tsx";
import { ConnectionBanner } from "./components/ConnectionBanner.tsx";
import { ConversationPanel } from "./components/ConversationPanel.tsx";
import { NewThreadDialog } from "./components/NewThreadDialog.tsx";
import { useAutomations } from "./useAutomations.ts";
import { useDashboard } from "./useDashboard.ts";

type Tab = "agents" | "board";

export function App() {
  const { state, sseDown, lastEvent } = useDashboard();
  const [tab, setTab] = useState<Tab>("agents");
  const automations = useAutomations(tab === "agents");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [now, setNow] = useState(() => new Date());

  // Relative times and the 24 h window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const live = !sseDown && state?.connection.t3 === "live";

  return (
    <div className="app">
      <header className="topbar">
        <h1>T3 Dashboard</h1>
        <nav className="tabs" role="tablist">
          {(["agents", "board"] as const).map((id) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>
              {id === "agents" ? "Agents" : "Board"}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        <span className={`conn ${live ? "up" : "down"}`} title={live ? "Connecté à T3 Code" : "Connexion perdue"}>
          <span className="conn-dot" /> {live ? "Connecté" : "Hors ligne"}
        </span>
        {state && (
          <button className="primary" onClick={() => setCreating(true)}>
            Nouveau thread
          </button>
        )}
      </header>
      <ConnectionBanner connection={state?.connection ?? null} sseDown={sseDown} />
      <main>
        {tab === "agents" &&
          (state ? (
            <AgentsView
              state={state}
              now={now}
              selectedId={selectedId}
              onOpen={setSelectedId}
              automations={automations.result}
              automationsError={automations.error}
            />
          ) : <p className="empty">Chargement…</p>)}
        {tab === "board" && <BoardView onShowAgents={() => setTab("agents")} />}
      </main>
      {state && selectedId && (
        <ConversationPanel
          key={selectedId}
          threadId={selectedId}
          thread={state.threads.find((t) => t.id === selectedId) ?? null}
          lastEvent={lastEvent}
          onClose={() => setSelectedId(null)}
        />
      )}
      {state && creating && (
        <NewThreadDialog
          projects={state.projects}
          providers={state.providers}
          defaultProjectId={null}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setTab("agents");
            setSelectedId(id);
          }}
        />
      )}
    </div>
  );
}
