import { useEffect, useState } from "react";
import { AgentsView } from "./components/AgentsView.tsx";
import { BoardView } from "./components/BoardView.tsx";
import { ConnectionBanner } from "./components/ConnectionBanner.tsx";
import { DeskView } from "./components/DeskView.tsx";
import { NewThreadDialog } from "./components/NewThreadDialog.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { DESK_LIMIT, gridWindows, isFull } from "./desk.ts";
import { useAutomations } from "./useAutomations.ts";
import { useDashboard } from "./useDashboard.ts";
import { useDesk } from "./useDesk.ts";
import { useShortcuts } from "./useShortcuts.ts";
import { useTheme } from "./useTheme.ts";

type Tab = "agents" | "board" | "desk";

const TABS: Array<{ id: Tab; label: string; key: string }> = [
  { id: "agents", label: "Agents", key: "1" },
  { id: "board", label: "Board", key: "2" },
  { id: "desk", label: "Desk", key: "3" },
];
const TOAST_MS = 8000;

// A full Desk keeps the request so "Replace oldest" can finish it.
interface FullToast {
  id: string;
  showDesk: boolean;
}

function focusComposer(threadId: string) {
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-desk-window="${CSS.escape(threadId)}"] textarea`)?.focus());
}

export function App() {
  const { state, sseDown, lastEvent } = useDashboard();
  const [tab, setTab] = useState<Tab>("agents");
  const automations = useAutomations(tab === "agents");
  const [desk, dispatchDesk] = useDesk(state?.connection.t3 === "live" ? state.threads : null);
  const [toast, setToast] = useState<FullToast | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useTheme();
  const [now, setNow] = useState(() => new Date());

  // Relative times and the 24 h window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(id);
  }, [toast]);

  function openOnDesk(id: string, showDesk: boolean) {
    if (isFull(desk, id)) {
      setToast({ id, showDesk });
      return;
    }
    dispatchDesk({ type: "open", id });
    if (showDesk) setTab("desk");
  }

  function toggleOnDesk(id: string) {
    if (desk.windows.some((w) => w.id === id)) dispatchDesk({ type: "close", id });
    else openOnDesk(id, false);
  }

  useShortcuts(
    (action) => {
      if (action === "agents" || action === "board" || action === "desk") setTab(action);
      else if (action === "settings") setSettingsOpen(true);
      else if (action === "new-agent") {
        if (state) setCreating(true);
      } else if (action === "unmaximize") dispatchDesk({ type: "unmaximize" });
      else if (action === "close-window" || action === "toggle-maximize") {
        if (desk.focusedId) dispatchDesk({ type: action === "close-window" ? "close" : "maximize", id: desk.focusedId });
      } else {
        const target = gridWindows(desk)[Number(action.slice("window-".length)) - 1];
        if (!target) return;
        dispatchDesk({ type: "focus", id: target.id });
        focusComposer(target.id);
      }
    },
    creating || settingsOpen,
    tab === "desk",
  );

  const live = !sseDown && state?.connection.t3 === "live";
  const deskIds = new Set(desk.windows.map((w) => w.id));
  const deskWaiting = state?.threads.some((t) => t.pending && deskIds.has(t.id)) ?? false;

  return (
    <div className={`app${tab === "desk" ? " desk-mode" : ""}`}>
      <header className="topbar">
        <h1>T3 Dashboard</h1>
        <nav className="tabs" role="tablist">
          {TABS.map(({ id, label, key }) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} title={`${label} (${key})`} onClick={() => setTab(id)}>
              {label}
              {id === "desk" && desk.windows.length > 0 && (
                <span className="count" aria-label={`${desk.windows.length} open`}>
                  {desk.windows.length}
                </span>
              )}
              {id === "desk" && deskWaiting && <span className="tab-alert" role="img" aria-label="An agent is waiting for your reply" />}
              <kbd>{key}</kbd>
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
              deskIds={deskIds}
              onOpen={(id, addOnly) => openOnDesk(id, !addOnly)}
              onToggleDesk={toggleOnDesk}
              automations={automations.result}
              automationsError={automations.error}
            />
          ) : <p className="empty">Loading…</p>)}
        {tab === "board" && <BoardView onAssigned={(id) => openOnDesk(id, false)} onShowDesk={() => setTab("desk")} />}
        {tab === "desk" &&
          (state ? (
            <DeskView desk={desk} dispatch={dispatchDesk} threads={state.threads} projects={state.projects} lastEvent={lastEvent} />
          ) : <p className="empty">Loading…</p>)}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span>Desk is full ({DESK_LIMIT}). Close a window first.</span>
          <button
            onClick={() => {
              dispatchDesk({ type: "replaceOldest", id: toast.id });
              if (toast.showDesk) setTab("desk");
              setToast(null);
            }}
          >
            Replace oldest
          </button>
          <button className="icon-button" aria-label="Dismiss" title="Dismiss" onClick={() => setToast(null)}>
            ✕
          </button>
        </div>
      )}
      {state && creating && (
        <NewThreadDialog
          projects={state.projects}
          providers={state.providers}
          defaultProjectId={null}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            openOnDesk(id, true);
          }}
        />
      )}
      {settingsOpen && <SettingsDialog theme={theme} onThemeChange={setTheme} onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
