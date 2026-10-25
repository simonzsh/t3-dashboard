import { useEffect, useState } from "react";
import { AgentsView } from "./components/AgentsView.tsx";
import { BoardView } from "./components/BoardView.tsx";
import { ConnectionBanner } from "./components/ConnectionBanner.tsx";
import { DeskView } from "./components/DeskView.tsx";
import { NewThreadDialog } from "./components/NewThreadDialog.tsx";
import { SettingsDialog } from "./components/SettingsDialog.tsx";
import { SetupScreen } from "./components/SetupScreen.tsx";
import { UpdateDialog } from "./components/UpdateDialog.tsx";
import { DESK_LIMIT, gridWindows, isFull } from "./desk.ts";
import { useAutomations } from "./useAutomations.ts";
import { useDashboard } from "./useDashboard.ts";
import { useDesk } from "./useDesk.ts";
import { useDeskBackground } from "./useDeskBackground.ts";
import { useShortcuts } from "./useShortcuts.ts";
import { useTheme } from "./useTheme.ts";
import { useUpdate } from "./useUpdate.ts";
import { Button, Icon, IconButton, Kbd, Pressable } from "./ui/index.ts";
import { updateLabel } from "./updateFlow.ts";

type Tab = "agents" | "board" | "desk";

const TABS: Array<{ id: Tab; label: string; key: string }> = [
  { id: "agents", label: "Agents", key: "1" },
  { id: "desk", label: "Desk", key: "2" },
  { id: "board", label: "Board", key: "3" },
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
  const automations = useAutomations(tab === "agents" && state?.automationsAvailable === true);
  const [desk, dispatchDesk] = useDesk(state?.connection.t3 === "live" ? state.threads : null);
  const [toast, setToast] = useState<FullToast | null>(null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const update = useUpdate();
  const [boardVersion, setBoardVersion] = useState(0);
  const [theme, setTheme] = useTheme();
  const [deskBackground, setDeskBackground] = useDeskBackground();
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
      else if (action === "close-window" || action === "toggle-fullscreen" || action === "minimize-window") {
        const type = action === "close-window" ? "close" : action === "minimize-window" ? "minimize" : "maximize";
        if (desk.focusedId) dispatchDesk({ type, id: desk.focusedId });
      } else {
        const target = gridWindows(desk)[Number(action.slice("window-".length)) - 1];
        if (!target) return;
        dispatchDesk({ type: "focus", id: target.id });
        focusComposer(target.id);
      }
    },
    creating || settingsOpen || confirmingUpdate,
    tab === "desk",
  );

  const live = !sseDown && state?.connection.t3 === "live";
  const deskIds = new Set(desk.windows.map((w) => w.id));
  const deskWaiting = state?.threads.some((t) => t.pending && deskIds.has(t.id)) ?? false;

  if (state?.connection.setup) return <SetupScreen setup={state.connection.setup} />;

  return (
    <div className={`app${tab === "desk" ? " desk-mode" : ""}`}>
      <header className="topbar">
        <h1>T3 Dashboard</h1>
        <nav className="tabs" role="tablist">
          {TABS.map(({ id, label, key }) => (
            <Pressable key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} title={`${label} (${key})`} onClick={() => setTab(id)}>
              {label}
              {id === "desk" && deskWaiting && <span className="tab-alert" role="img" aria-label="An agent is waiting for your reply" />}
              <Kbd>{key}</Kbd>
            </Pressable>
          ))}
        </nav>
        <div className="topbar-right">
          {update.status?.available && update.status.canUpdate && (
            <Button className="update-pill" title="A new version is available" loading={(update.updating || update.status.updating) && "Updating…"} onClick={() => setConfirmingUpdate(true)}>
              {updateLabel(update.status)}
            </Button>
          )}
          <span className={`conn ${live ? "up" : "down"}`} title={live ? "Connected to T3 Code" : "Connection lost"}>
            <span className="conn-dot" /> {live ? "Connected" : "Offline"}
          </span>
          {state && (
            <Button variant="primary" title="New Agent (n)" kbd="N" onClick={() => setCreating(true)}>
              New Agent
            </Button>
          )}
          <IconButton label="Settings" title="Settings (,)" kbd="," onClick={() => setSettingsOpen(true)}>
            <Icon name="settings" strokeWidth={1.8} />
          </IconButton>
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
        {tab === "board" && <BoardView projects={state?.projects ?? []} version={boardVersion} onAssigned={(id) => openOnDesk(id, false)} onShowDesk={() => setTab("desk")} />}
        {tab === "desk" &&
          (state ? (
            <DeskView
              desk={desk}
              dispatch={dispatchDesk}
              threads={state.threads}
              projects={state.projects}
              lastEvent={lastEvent}
              background={deskBackground}
              t3EnvironmentId={state.t3EnvironmentId}
              providers={state.providers}
            />
          ) : <p className="empty">Loading…</p>)}
      </main>
      {toast && (
        <div className="toast" role="status">
          <span>Desk is full ({DESK_LIMIT}). Close a window first.</span>
          <Button
            onClick={() => {
              dispatchDesk({ type: "replaceOldest", id: toast.id });
              if (toast.showDesk) setTab("desk");
              setToast(null);
            }}
          >
            Replace oldest
          </Button>
          <IconButton label="Dismiss" variant="ghost" size="sm" onClick={() => setToast(null)}>
            <Icon name="x" />
          </IconButton>
        </div>
      )}
      {state && creating && (
        <NewThreadDialog
          projects={state.projects}
          providers={state.providers}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            openOnDesk(id, true);
          }}
        />
      )}
      {confirmingUpdate && update.status && (
        <UpdateDialog
          status={update.status}
          onClose={() => setConfirmingUpdate(false)}
          onConfirm={() => {
            setConfirmingUpdate(false);
            void update.apply();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsDialog
          theme={theme}
          onThemeChange={setTheme}
          background={deskBackground}
          onBackgroundChange={setDeskBackground}
          onLinearChange={() => setBoardVersion((version) => version + 1)}
          update={update}
          onUpdate={() => {
            setSettingsOpen(false);
            setConfirmingUpdate(true);
          }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
