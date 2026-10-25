import { useEffect, useState } from "react";
import { AgentsView } from "./components/AgentsView.tsx";
import { BoardView } from "./components/BoardView.tsx";
import { ConnectionBanner } from "./components/ConnectionBanner.tsx";
import { ConversationPanel } from "./components/ConversationPanel.tsx";
import { NewThreadDialog } from "./components/NewThreadDialog.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { useAutomations } from "./useAutomations.ts";
import { useDashboard } from "./useDashboard.ts";
import { useShortcuts } from "./useShortcuts.ts";
import { useTheme } from "./useTheme.ts";

type Tab = "agents" | "board";

const TABS: Array<{ id: Tab; label: string; key: string }> = [
  { id: "agents", label: "Agents", key: "1" },
  { id: "board", label: "Board", key: "2" },
];

export function App() {
  const { state, sseDown, lastEvent } = useDashboard();
  const [tab, setTab] = useState<Tab>("agents");
  const automations = useAutomations(tab === "agents");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const [now, setNow] = useState(() => new Date());

  // Relative times and the 24 h window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useShortcuts((action) => {
    if (action === "agents" || action === "board") setTab(action);
    else if (action === "settings") setSettingsOpen(true);
    else if (state) setCreating(true);
  }, creating || settingsOpen);

  const live = !sseDown && state?.connection.t3 === "live";

  return (
    <div className="app">
      <header className="topbar">
        <h1>T3 Dashboard</h1>
        <nav className="tabs" role="tablist">
          {TABS.map(({ id, label, key }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} title={`${label} (${key})`} onClick={() => setTab(id)}>
              {label} <kbd>{key}</kbd>
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <span className={`conn ${live ? "up" : "down"}`} title={live ? "Connected to T3 Code" : "Connection lost"}>
            <span className="conn-dot" /> {live ? "Connected" : "Offline"}
          </span>
          {state && (
            <button className="primary" title="New Agent (n)" onClick={() => setCreating(true)}>
              New Agent
            </button>
          )}
          <button className="icon-button" aria-label="Settings" title="Settings (,)" onClick={() => setSettingsOpen(true)}>
            <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
              <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
              </g>
            </svg>
          </button>
        </div>
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
          ) : <p className="empty">Loading…</p>)}
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
      {settingsOpen && <SettingsDialog theme={theme} onThemeChange={setTheme} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
