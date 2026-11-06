import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashboardThread } from "../../shared/api.ts";
import { AutomationsView } from "./features/automations/AutomationsView.tsx";
import { DashboardView } from "./features/dashboard/DashboardView.tsx";
import { isDefaultLayout } from "./features/dashboard/layout.ts";
import { useDashboardLayout } from "./features/dashboard/useDashboardLayout.ts";
import { useUsage } from "./features/dashboard/useUsage.ts";
import { AppNav } from "./features/shell/AppNav.tsx";
import { PageActions } from "./features/shell/PageActions.tsx";
import { ConnectionBanner } from "./features/setup/ConnectionBanner.tsx";
import { SessionsView } from "./features/sessions/SessionsView.tsx";
import { NewAutomationDialog } from "./features/new-thread/NewAutomationDialog.tsx";
import { NewThreadDialog } from "./features/new-thread/NewThreadDialog.tsx";
import { NotificationToasts } from "./features/notifications/NotificationToasts.tsx";
import { useNotifications } from "./features/notifications/useNotifications.ts";
import { useSetupRows } from "./features/automations/useSetupRows.ts";
import { listedThreads, threadSections, unreadCount } from "./features/dashboard/sections.ts";
import { Switcher } from "./features/switcher/Switcher.tsx";
import { useOpenHistory } from "./features/switcher/useOpenHistory.ts";
import { SettingsDialog } from "./features/settings/SettingsDialog.tsx";
import { SetupScreen } from "./features/setup/SetupScreen.tsx";
import { UpdateDialog } from "./features/update/UpdateDialog.tsx";
import { focusSessionField } from "./features/sessions/dom.ts";
import { columnLeadId, NARROW_STRIP, neighborId, type Direction } from "./features/sessions/sessions.ts";
import { useAutomations } from "./features/automations/useAutomations.ts";
import { api } from "./api/client.ts";
import { useDashboard } from "./api/events.ts";
import { useSessions } from "./features/sessions/useSessions.ts";
import { useSessionsSync } from "./features/sessions/useSessionsSync.ts";
import { useMediaQuery } from "./lib/useMediaQuery.ts";
import { useShortcuts } from "./lib/useShortcuts.ts";
import { useSessionLayout } from "./lib/sessionLayout.ts";
import { useSidebarCollapsed } from "./lib/sidebar.ts";
import { navBadges } from "./lib/navBadges.ts";
import { TABS } from "./lib/tabs.ts";
import { useTab } from "./lib/useTab.ts";
import { useTheme } from "./features/settings/useTheme.ts";
import { useAccent } from "./features/settings/useAccent.ts";
import { useUpdate } from "./features/update/useUpdate.ts";
import { Loader, Logo, PageHeader, TooltipLayer } from "./ui/index.ts";
import { updateLabel } from "./features/update/updateFlow.ts";

const NO_THREADS: DashboardThread[] = [];
// Same breakpoint as the bottom bar in styles.css.
const PHONE = "(max-width: 700px)";

export function App() {
  const { state, sseDown, remoteSessions, remoteSeen, connects } = useDashboard();
  const [tab, setTab] = useTab();
  // Always loaded while live: the Dashboard badge must leave out automation run threads.
  const automations = useAutomations(state?.connection.t3 === "live");
  const [sessions, dispatchSessions] = useSessions();
  const [openHistory, recordOpened] = useOpenHistory();
  useSessionsSync({
    sessions,
    dispatch: dispatchSessions,
    threads: state?.connection.t3 === "live" ? state.threads : null,
    remote: remoteSessions,
    connects,
  });
  // The focused sessions window on the visible Sessions tab is already in front of the user: no toast for it.
  const watching = useRef<(id: string) => boolean>(() => false);
  watching.current = (id) => tab === "sessions" && sessions.focusedId === id;
  const notify = useNotifications({
    threads: state?.connection.t3 === "live" ? state.threads : null,
    quiet: useCallback((id: string) => watching.current(id), []),
    remote: remoteSeen,
    connects,
  });
  // The focused sessions window on the visible Sessions tab is read: on a click, a restore, and on each new activity.
  // Only openInSessions marked threads before, so a session already open stayed unread on the Dashboard.
  const readId = tab === "sessions" ? sessions.focusedId : null;
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
  const [accent, setAccent] = useAccent();
  const [layout, setLayout] = useSessionLayout();
  // The grid toggle needs room for two-row columns side by side: not on a phone.
  const showLayoutToggle = !useMediaQuery(NARROW_STRIP);
  const [now, setNow] = useState(() => new Date());
  const compact = useMediaQuery(PHONE);
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed();

  // The error banner starts under the header, whatever its height (one line on a phone).
  const header = useRef<HTMLElement>(null);
  const hasHeader = !state?.connection.setup;
  useLayoutEffect(() => {
    const el = header.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--header-h");
    };
  }, [hasHeader]);

  // Relative times and the 24 h window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  function openInSessions(id: string, showSessions: boolean) {
    dispatchSessions({ type: "open", id });
    recordOpened(id);
    notify.markSeen(id);
    if (showSessions) setTab("sessions");
  }

  function toggleInSessions(id: string) {
    if (sessions.ids.includes(id)) dispatchSessions({ type: "close", id });
    else openInSessions(id, false);
  }

  // The rows are memoized: these callbacks keep one identity and call the latest handlers.
  const handlers = useRef({ openInSessions, toggleInSessions });
  handlers.current = { openInSessions, toggleInSessions };
  const onOpen = useCallback((id: string, addOnly: boolean) => handlers.current.openInSessions(id, !addOnly), []);
  const onToggleSessions = useCallback((id: string) => handlers.current.toggleInSessions(id), []);
  const onSettle = useCallback((id: string, settle: boolean) => (settle ? api.settle(id) : api.unsettle(id)), []);

  const openSearch = () => {
    if (state) setSwitcherQuery("");
  };

  const blocked = creating || creatingAutomation || settingsOpen || confirmingUpdate || switcherQuery !== null;
  useShortcuts(
    (action) => {
      if (action === "dashboard" || action === "sessions" || action === "automations") setTab(action);
      else if (action === "settings") setSettingsOpen(true);
      else if (action === "toggle-sidebar") {
        if (!compact) toggleSidebar();
      } else if (action === "switcher") {
        if (state && !creating && !creatingAutomation && !settingsOpen && !confirmingUpdate) setSwitcherQuery((open) => (open === null ? "" : null));
      } else if (action === "new-session") {
        if (state) setCreating(true);
      } else if (action === "new-automation") {
        if (state) setCreatingAutomation(true);
      } else if (action === "unmaximize") {
        if (sessions.maximized && sessions.focusedId) dispatchSessions({ type: "maximize", id: sessions.focusedId });
      } else if (action.startsWith("focus-")) {
        // A maximized window hides its neighbors: arrows do nothing there.
        const id = sessions.maximized ? null : neighborId(sessions, action.slice("focus-".length) as Direction, layout);
        if (!id) return;
        // No composer focus: a focused textarea would block the next arrow.
        dispatchSessions({ type: "focus", id });
      } else if (action === "close-window" || action === "toggle-fullscreen") {
        if (sessions.focusedId) dispatchSessions({ type: action === "close-window" ? "close" : "maximize", id: sessions.focusedId });
      } else {
        const target = columnLeadId(sessions, Number(action.slice("window-".length)), layout);
        if (!target) return;
        dispatchSessions({ type: "focus", id: target });
        requestAnimationFrame(() => focusSessionField(target));
      }
    },
    blocked,
    tab === "sessions",
  );

  const live = !sseDown && state?.connection.t3 === "live";
  const sessionIds = useMemo(() => new Set(sessions.ids), [sessions.ids]);
  const setup = useSetupRows(state?.threads ?? NO_THREADS, automations.result?.setupThreadIds, automations.reload);
  // One list for the Dashboard cards and the badge, so they cannot drift apart.
  const visible = useMemo(
    () => listedThreads(state?.threads ?? NO_THREADS, automations.result?.hiddenThreadIds, setup.map((t) => t.id)),
    [state?.threads, automations.result?.hiddenThreadIds, setup],
  );
  const unread = useMemo(() => unreadCount(threadSections(visible, notify.seen), notify.seen), [visible, notify.seen]);
  const badges = navBadges(state?.threads ?? NO_THREADS, sessionIds);
  const dashboardLayout = useDashboardLayout(tab === "dashboard");
  const usage = useUsage(tab === "dashboard" && state !== null);
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
    <div className={`app${tab === "sessions" ? " sessions-mode" : ""}`}>
      <TooltipLayer />
      <AppNav
        layout={compact ? "bottom" : "side"}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        tab={tab}
        unread={unread}
        badges={badges}
        live={live}
        update={updateNav}
        onTab={setTab}
        onSearch={openSearch}
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
            <PageActions
              tab={tab}
              compact={compact}
              ready={state !== null}
              editingLayout={dashboardLayout.editing}
              layoutIsDefault={isDefaultLayout(dashboardLayout.layout)}
              layout={layout}
              onLayoutChange={setLayout}
              showLayoutToggle={showLayoutToggle}
              onNewSession={() => setCreating(true)}
              onNewAutomation={() => setCreatingAutomation(true)}
              onSearch={openSearch}
              onEditLayout={() => dashboardLayout.setEditing(true)}
              onDoneLayout={() => dashboardLayout.setEditing(false)}
              onResetLayout={dashboardLayout.reset}
            />
          }
        />
        <ConnectionBanner connection={state?.connection ?? null} sseDown={sseDown} />
        <NotificationToasts toasts={notify.toasts} onOpen={(id) => openInSessions(id, true)} onDismiss={notify.dismiss} />
        <main>
          {tab === "dashboard" &&
            (state ? (
              <DashboardView
                state={state}
                usage={usage}
                visible={visible}
                now={now}
                sessionIds={sessionIds}
                layout={dashboardLayout.layout}
                editing={dashboardLayout.editing}
                onLayout={dashboardLayout.setLayout}
                onOpen={onOpen}
                onToggleSessions={onToggleSessions}
                onSettle={onSettle}
                seen={notify.seen}
                seenReady={notify.seenReady}
                onMarkRead={notify.markSeen}
                automations={automations.result}
                automationsError={automations.error}
                linearVersion={linearVersion}
              />
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
          {tab === "sessions" &&
            (state ? (
              <SessionsView
                sessions={sessions}
                dispatch={dispatchSessions}
                threads={state.threads}
                projects={state.projects}
                layout={layout}
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
            openInSessions(id, true);
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
          inSessions={sessionIds}
          initialQuery={switcherQuery}
          onClose={() => setSwitcherQuery(null)}
          onOpen={(id) => {
            setSwitcherQuery(null);
            openInSessions(id, true);
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
          accent={accent}
          onAccentChange={setAccent}
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
