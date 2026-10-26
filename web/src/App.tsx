import type { ModelDefaults } from "../../shared/api.ts";
import { useEffect, useState } from "react";
import { AgentsView } from "./features/agents/AgentsView.tsx";
import { BoardView } from "./features/board/BoardView.tsx";
import { ConnectionBanner } from "./features/setup/ConnectionBanner.tsx";
import { DeskView } from "./features/desk/DeskView.tsx";
import { NewThreadDialog } from "./features/new-thread/NewThreadDialog.tsx";
import { SettingsDialog } from "./features/settings/SettingsDialog.tsx";
import { SetupScreen } from "./features/setup/SetupScreen.tsx";
import { UpdateDialog } from "./features/update/UpdateDialog.tsx";
import { gridWindows } from "./features/desk/desk.ts";
import { useAutomations } from "./features/agents/useAutomations.ts";
import { useDashboard } from "./api/events.ts";
import { useDesk } from "./features/desk/useDesk.ts";
import { useDeskBackground } from "./features/desk/useDeskBackground.ts";
import { useMediaQuery } from "./lib/useMediaQuery.ts";
import { useShortcuts } from "./lib/useShortcuts.ts";
import { TABS } from "./lib/tabs.ts";
import { useTab } from "./lib/useTab.ts";
import { useTheme } from "./features/settings/useTheme.ts";
import { useUpdate } from "./features/update/useUpdate.ts";
import { Button, Icon, IconButton, Kbd, Loader, Pressable, TooltipLayer } from "./ui/index.ts";
import { updateLabel } from "./features/update/updateFlow.ts";

const NO_DEFAULTS: ModelDefaults = { selection: null, runtimeMode: null };

// Same breakpoint as the one-line header in styles.css.
const COMPACT_HEADER = "(max-width: 700px)";

function focusComposer(threadId: string) {
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-desk-window="${CSS.escape(threadId)}"] textarea`)?.focus());
}

export function App() {
  const { state, sseDown } = useDashboard();
  const [tab, setTab] = useTab();
  const automations = useAutomations(tab === "agents" && state?.automationsAvailable === true);
  const [desk, dispatchDesk] = useDesk(state?.connection.t3 === "live" ? state.threads : null);
  const [creating, setCreating] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  const update = useUpdate();
  const [boardVersion, setBoardVersion] = useState(0);
  const [theme, setTheme] = useTheme();
  const [deskBackground, setDeskBackground] = useDeskBackground();
  const [now, setNow] = useState(() => new Date());
  const compact = useMediaQuery(COMPACT_HEADER);

  // Relative times and the 24 h window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  function openOnDesk(id: string, showDesk: boolean) {
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

  if (state?.connection.setup) {
    return (
      <>
        <SetupScreen setup={state.connection.setup} />
        <TooltipLayer />
      </>
    );
  }

  return (
    <div className={`app${tab === "desk" ? " desk-mode" : ""}`}>
      <TooltipLayer />
      <header className="topbar">
        <div className="topbar-left">
          <h1>
            T3<span className="title-rest"> Dashboard</span>
          </h1>
          <span className={`conn ${live ? "up" : "down"}`} data-tooltip={live ? "Connected to T3 Code" : "Connection lost"}>
            <span className="conn-dot" /> <span className="conn-label">{live ? "Connected" : "Offline"}</span>
          </span>
        </div>
        <nav className="tabs" role="tablist">
          {TABS.map(({ id, label, key }) => (
            <Pressable key={id} role="tab" aria-selected={tab === id} className={tab === id ? "active" : ""} tooltip={label} shortcut={key} onClick={() => setTab(id)}>
              {label}
              {id === "desk" && deskWaiting && <span className="tab-alert" role="img" aria-label="An agent is waiting for your reply" />}
              <Kbd>{key}</Kbd>
            </Pressable>
          ))}
        </nav>
        <div className="topbar-right">
          {update.status?.available && update.status.canUpdate &&
            (compact ? (
              <IconButton className="update-pill" label={updateLabel(update.status)} disabled={update.updating || update.status.updating} onClick={() => setConfirmingUpdate(true)}>
                <Icon name="arrowUp" strokeWidth={1.8} />
              </IconButton>
            ) : (
              <Button className="update-pill" tooltip="A new version is available" loading={(update.updating || update.status.updating) && "Updating…"} onClick={() => setConfirmingUpdate(true)}>
                {updateLabel(update.status)}
              </Button>
            ))}
          {state &&
            (compact ? (
              <IconButton variant="primary" label="New Agent" shortcut="N" onClick={() => setCreating(true)}>
                <Icon name="plus" />
              </IconButton>
            ) : (
              <Button variant="primary" tooltip="New Agent" shortcut="N" kbd="N" onClick={() => setCreating(true)}>
                New Agent
              </Button>
            ))}
          <IconButton label="Settings" shortcut="," kbd="," onClick={() => setSettingsOpen(true)}>
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
          ) : <Loader />)}
        {tab === "board" && <BoardView projects={state?.projects ?? []} providers={state?.providers ?? []} modelDefaults={state?.modelDefaults ?? NO_DEFAULTS} version={boardVersion} onAssigned={(id) => openOnDesk(id, false)} onShowDesk={() => setTab("desk")} />}
        {tab === "desk" &&
          (state ? (
            <DeskView
              desk={desk}
              dispatch={dispatchDesk}
              threads={state.threads}
              projects={state.projects}
              background={deskBackground}
              t3EnvironmentId={state.t3EnvironmentId}
              providers={state.providers}
            />
          ) : <Loader />)}
      </main>
      {state && creating && (
        <NewThreadDialog
          projects={state.projects}
          providers={state.providers}
          defaults={state.modelDefaults}
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
