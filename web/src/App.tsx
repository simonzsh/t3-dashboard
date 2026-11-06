import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashboardThread } from "../../shared/api.ts";
import { AutomationsView } from "./features/automations/AutomationsView.tsx";
import { HomeView } from "./features/home/HomeView.tsx";
import { useUsage } from "./features/home/useUsage.ts";
import { InboxView } from "./features/inbox/InboxView.tsx";
import { AppNav } from "./features/shell/AppNav.tsx";
import { ConnectionBanner } from "./features/setup/ConnectionBanner.tsx";
import { DeskView } from "./features/desk/DeskView.tsx";
import { NewAutomationDialog } from "./features/new-thread/NewAutomationDialog.tsx";
import { NewThreadDialog } from "./features/new-thread/NewThreadDialog.tsx";
import { NotificationToasts } from "./features/notifications/NotificationToasts.tsx";
import { badgeText } from "./features/notifications/notifications.ts";
import { useNotifications } from "./features/notifications/useNotifications.ts";
import { useSetupRows } from "./features/automations/useSetupRows.ts";
import { inboxSections, inboxThreads, unreadCount } from "./features/inbox/inbox.ts";
import { Switcher } from "./features/switcher/Switcher.tsx";
import { useOpenHistory } from "./features/switcher/useOpenHistory.ts";
import { SettingsDialog } from "./features/settings/SettingsDialog.tsx";
import { SetupScreen } from "./features/setup/SetupScreen.tsx";
import { UpdateDialog } from "./features/update/UpdateDialog.tsx";
import { gridWindows, neighborId, type Direction } from "./features/desk/desk.ts";
import { useAutomations } from "./features/automations/useAutomations.ts";
import { api } from "./api/client.ts";
import { useDashboard } from "./api/events.ts";
import { useDesk } from "./features/desk/useDesk.ts";
import { useDeskSync } from "./features/desk/useDeskSync.ts";
import { useDeskBackground } from "./features/desk/useDeskBackground.ts";
import { useMediaQuery } from "./lib/useMediaQuery.ts";
import { useShortcuts } from "./lib/useShortcuts.ts";
import { navBadges } from "./lib/navBadges.ts";
import { TABS } from "./lib/tabs.ts";
import { ctrlLabel, startsTyping } from "./lib/shortcuts.ts";
import { useTab } from "./lib/useTab.ts";
import { useTheme } from "./features/settings/useTheme.ts";
import { useUpdate } from "./features/update/useUpdate.ts";
import { Button, Icon, IconButton, Loader, Logo, PageHeader, TooltipLayer } from "./ui/index.ts";
import { updateLabel } from "./features/update/updateFlow.ts";

const NO_THREADS: DashboardThread[] = [];
// Same breakpoint as the bottom bar in styles.css.
const PHONE = "(max-width: 700px)";

function focusComposer(threadId: string) {
  requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`[data-desk-window="${CSS.escape(threadId)}"] textarea`)?.focus());
}

export function App() {
  const { state, sseDown, remoteDesk, remoteSeen, connects } = useDashboard();
  const [tab, setTab] = useTab();
  // Always loaded while live: the Inbox badge must leave out automation run threads.
  const automations = useAutomations(state?.connection.t3 === "live");
  const [desk, dispatchDesk] = useDesk();
  const [openHistory, recordOpened] = useOpenHistory();
  useDeskSync({
    desk,
    dispatch: dispatchDesk,
    threads: state?.connection.t3 === "live" ? state.threads : null,
    remote: remoteDesk,
    connects,
  });
  // The focused desk window on the visible Desk tab is already in front of the user: no toast for it.
  const watching = useRef<(id: string) => boolean>(() => false);
  watching.current = (id) => tab === "desk" && desk.focusedId === id;
  const notify = useNotifications({
    threads: state?.connection.t3 === "live" ? state.threads : null,
    quiet: useCallback((id: string) => watching.current(id), []),
    remote: remoteSeen,
    connects,
  });
  // The focused desk window on the visible Desk tab is read: on a click, a restore, and on each new activity.
  // Only openOnDesk marked threads before, so a window already on the desk stayed unread in the Inbox.
  const readId = tab === "desk" ? desk.focusedId : null;
  const readAt = readId ? state?.threads.find((t) => t.id === readId)?.lastActivityAt : undefined;
  const { markSeen, seenReady } = notify;
  useEffect(() => {
    if (readId && readAt && seenReady) markSeen(readId);
  }, [readId, readAt, seenReady, markSeen]);
  const [creating, setCreating] = useState(false);
  const [creatingAutomation, setCreatingAutomation] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  // null: closed; a string: open, seeded with that query.
  const [switcherQuery, setSwitcherQuery] = useState<string | null>(null);
  const update = useUpdate();
  const [linearVersion, setLinearVersion] = useState(0);
  const [theme, setTheme] = useTheme();
  const [deskBackground, setDeskBackground] = useDeskBackground();
  const [now, setNow] = useState(() => new Date());
  const compact = useMediaQuery(PHONE);

  // The error banner starts under the header, whatever its height (one line on a phone).
  const header = useRef<HTMLElement>(null);
  const hasHeader = !state?.connection.setup;
  useLayoutEffect(() => {
    const el = header.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--topbar-h", `${el.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--topbar-h");
    };
  }, [hasHeader]);

  // Relative times and the 24 h window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  function openOnDesk(id: string, showDesk: boolean) {
    dispatchDesk({ type: "open", id });
    recordOpened(id);
    notify.markSeen(id);
    if (showDesk) setTab("desk");
  }

  function toggleOnDesk(id: string) {
    if (desk.windows.some((w) => w.id === id)) dispatchDesk({ type: "close", id });
    else openOnDesk(id, false);
  }

  // The rows are memoized: these callbacks keep one identity and call the latest handlers.
  const handlers = useRef({ openOnDesk, toggleOnDesk });
  handlers.current = { openOnDesk, toggleOnDesk };
  const onOpen = useCallback((id: string, addOnly: boolean) => handlers.current.openOnDesk(id, !addOnly), []);
  const onToggleDesk = useCallback((id: string) => handlers.current.toggleOnDesk(id), []);
  const onSettle = useCallback((id: string, settle: boolean) => (settle ? api.settle(id) : api.unsettle(id)), []);

  const blocked = creating || creatingAutomation || settingsOpen || confirmingUpdate || switcherQuery !== null;
  useShortcuts(
    (action) => {
      if (action === "home" || action === "desk" || action === "automations") setTab(action);
      else if (action === "settings") setSettingsOpen(true);
      else if (action === "switcher") {
        if (state && !creating && !creatingAutomation && !settingsOpen && !confirmingUpdate) setSwitcherQuery((open) => (open === null ? "" : null));
      } else if (action === "new-agent") {
        if (state) setCreating(true);
      } else if (action === "new-automation") {
        if (state) setCreatingAutomation(true);
      } else if (action === "unmaximize") dispatchDesk({ type: "unmaximize" });
      else if (action.startsWith("focus-")) {
        // A maximized window hides its neighbors: arrows do nothing there.
        const id = desk.maximizedId ? null : neighborId(desk, action.slice("focus-".length) as Direction);
        if (!id) return;
        // No composer focus: a focused textarea would block the next arrow.
        dispatchDesk({ type: "focus", id });
      }
      else if (action === "close-window" || action === "toggle-fullscreen" || action === "minimize-window") {
        const type = action === "close-window" ? "close" : action === "minimize-window" ? "minimize" : "maximize";
        // A subagent window (not in the shell) only goes full screen or closes.
        if (type === "minimize" && !state?.threads.some((t) => t.id === desk.focusedId)) return;
        if (desk.focusedId) dispatchDesk({ type, id: desk.focusedId });
      } else {
        const target = gridWindows(desk)[Number(action.slice("window-".length)) - 1];
        if (!target) return;
        dispatchDesk({ type: "focus", id: target.id });
        focusComposer(target.id);
      }
    },
    blocked,
    tab === "desk",
  );

  // Shortcuts use Ctrl now, so plain typing on the Desk can go straight to the focused window's field.
  useEffect(() => {
    if (tab !== "desk" || blocked || !desk.focusedId) return;
    const id = desk.focusedId;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null;
      if (!startsTyping({ key: e.key, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, target: el })) return;
      if (el?.closest('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      const field = document.querySelector<HTMLTextAreaElement>(`[data-desk-window="${CSS.escape(id)}"] textarea`);
      if (!field || field.disabled) return;
      // Focused during keydown: the browser then types this key into the field.
      field.focus();
      field.setSelectionRange(field.value.length, field.value.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tab, blocked, desk.focusedId]);

  const live = !sseDown && state?.connection.t3 === "live";
  const deskIds = new Set(desk.windows.map((w) => w.id));
  const setup = useSetupRows(state?.threads ?? NO_THREADS, automations.result?.setupThreadIds, automations.reload);
  // One list for the Inbox and its badge, so they cannot drift apart.
  const visible = useMemo(
    () => inboxThreads(state?.threads ?? NO_THREADS, automations.result?.hiddenThreadIds, setup.map((t) => t.id)),
    [state?.threads, automations.result?.hiddenThreadIds, setup],
  );
  const unread = useMemo(() => unreadCount(inboxSections(visible, notify.seen, now), notify.seen), [visible, notify.seen, now]);
  const badges = navBadges(state?.threads ?? NO_THREADS, deskIds, unread);
  const usage = useUsage(tab === "home" && state !== null);
  const page = TABS.find((t) => t.id === tab)!;
  const updateNav = update.status?.available && update.status.canUpdate ? { label: updateLabel(update.status), busy: update.updating || update.status.updating } : null;

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
      <AppNav
        layout={compact ? "bottom" : "side"}
        tab={tab}
        badges={badges}
        badgeText={badgeText}
        live={live}
        update={updateNav}
        onTab={setTab}
        onSearch={() => state && setSwitcherQuery("")}
        onSettings={() => setSettingsOpen(true)}
        onUpdate={() => setConfirmingUpdate(true)}
      />
      <div className="app-column">
        <PageHeader
          ref={header}
          title={page.label}
          description={page.description}
          leading={compact ? <Logo /> : undefined}
          actions={
            compact ? (
              state && (
                <>
                  <IconButton variant="primary" className="header-new" label="New Agent" onClick={() => setCreating(true)}>
                    <Icon name="assignBot" />
                  </IconButton>
                  <IconButton variant="ghost" label="New Automation" onClick={() => setCreatingAutomation(true)}>
                    <Icon name="calendarClock" />
                  </IconButton>
                  <IconButton variant="ghost" label="Search" onClick={() => setSwitcherQuery("")}>
                    <Icon name="search" />
                  </IconButton>
                </>
              )
            ) : (
              state && (
                <>
                  <Button variant="primary" kbd={ctrlLabel("N")} onClick={() => setCreating(true)}>
                    New Agent
                  </Button>
                  <Button kbd={ctrlLabel("⇧N")} onClick={() => setCreatingAutomation(true)}>
                    New Automation
                  </Button>
                </>
              )
            )
          }
        />
        <ConnectionBanner connection={state?.connection ?? null} sseDown={sseDown} />
        <NotificationToasts toasts={notify.toasts} onOpen={(id) => openOnDesk(id, true)} onDismiss={notify.dismiss} />
        <main>
          {tab === "home" &&
            (state ? (
              <HomeView usage={usage} threads={state.threads} now={now} unread={unread}>
                <InboxView
                  state={state}
                  visible={visible}
                  now={now}
                  deskIds={deskIds}
                  onOpen={onOpen}
                  onToggleDesk={onToggleDesk}
                  onSettle={onSettle}
                  seen={notify.seen}
                  seenReady={notify.seenReady}
                  onMarkRead={notify.markSeen}
                  automations={automations.result}
                  automationsError={automations.error}
                  linearVersion={linearVersion}
                />
              </HomeView>
            ) : <Loader />)}
          {tab === "automations" &&
            (state ? (
              <AutomationsView
                state={state}
                now={now}
                onOpen={onOpen}
                automations={automations.result}
                automationsError={automations.error}
                onAutomationsStale={automations.reload}
                onNewAutomation={() => setCreatingAutomation(true)}
                setup={setup}
              />
            ) : <Loader />)}
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
      </div>
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
      {state && creatingAutomation && (
        <NewAutomationDialog
          projects={state.projects}
          providers={state.providers}
          defaults={state.modelDefaults}
          onClose={() => setCreatingAutomation(false)}
          onSaved={automations.reload}
        />
      )}
      {state && switcherQuery !== null && (
        <Switcher
          threads={state.threads}
          projects={state.projects}
          now={now}
          history={openHistory}
          onDesk={new Set(gridWindows(desk).map((w) => w.id))}
          initialQuery={switcherQuery}
          onClose={() => setSwitcherQuery(null)}
          onOpen={(id) => {
            setSwitcherQuery(null);
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
          onLinearChange={() => setLinearVersion((version) => version + 1)}
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
