import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { DashboardThread } from "../../shared/api.ts";
import { AutomationsView } from "./features/automations/AutomationsView.tsx";
import { NewsSettingsDialog } from "./features/news/NewsSettingsDialog.tsx";
import { NewsView } from "./features/news/NewsView.tsx";
import { unreadNewsCount } from "./features/news/news.ts";
import { useNews } from "./features/news/useNews.ts";
import { DashboardView } from "./features/dashboard/DashboardView.tsx";
import { isDefaultLayout, type DashboardCard } from "./features/dashboard/layout.ts";
import { useDashboardLayout } from "./features/dashboard/useDashboardLayout.ts";
import { useNotificationsPanel } from "./features/dashboard/useNotificationsPanel.ts";
import { useActivity } from "./features/dashboard/useActivity.ts";
import { useLimits } from "./features/dashboard/useLimits.ts";
import { useServerStats } from "./features/dashboard/useServerStats.ts";
import { AppNav } from "./features/shell/AppNav.tsx";
import { PageActions } from "./features/shell/PageActions.tsx";
import { ConnectionBanner } from "./features/setup/ConnectionBanner.tsx";
import { SessionsView } from "./features/sessions/SessionsView.tsx";
import { NewAutomationDialog } from "./features/new-thread/NewAutomationDialog.tsx";
import { DeleteProjectDialog } from "./features/projects/DeleteProjectDialog.tsx";
import { EditProjectDialog } from "./features/projects/EditProjectDialog.tsx";
import { AddProjectDialog } from "./features/projects/AddProjectDialog.tsx";
import { NewThreadDialog } from "./features/new-thread/NewThreadDialog.tsx";
import { NotificationToasts } from "./features/notifications/NotificationToasts.tsx";
import { useNotifications } from "./features/notifications/useNotifications.ts";
import { useSetupRows } from "./features/automations/useSetupRows.ts";
import { attentionCount, threadSections } from "./features/dashboard/sections.ts";
import { Switcher } from "./features/switcher/Switcher.tsx";
import { useOpenHistory } from "./features/switcher/useOpenHistory.ts";
import { SettingsDialog } from "./features/settings/SettingsDialog.tsx";
import { SetupScreen } from "./features/setup/SetupScreen.tsx";
import { UpdateDialog } from "./features/update/UpdateDialog.tsx";
import { neighborId, type Direction } from "./features/sessions/sessions.ts";
import { useAutomations } from "./features/automations/useAutomations.ts";
import { automationsBadge } from "./features/automations/automations.ts";
import { AutomationThreadsContext } from "./lib/automationThreads.tsx";
import { useKeyboardClass } from "./lib/keyboard.ts";
import { api } from "./api/client.ts";
import { useDashboard } from "./api/events.ts";
import { useSessions } from "./features/sessions/useSessions.ts";
import { sessionsBadgeCount, useListPrefs } from "./features/sessions/sessionList.ts";
import { useSessionsSync } from "./features/sessions/useSessionsSync.ts";
import { useMediaQuery } from "./lib/useMediaQuery.ts";
import { useShortcuts } from "./lib/useShortcuts.ts";
import { useSessionLayout } from "./lib/sessionLayout.ts";
import { useSidebarCollapsed } from "./lib/sidebar.ts";
import { agentCounts } from "./lib/agents.ts";
import { TABS } from "./lib/tabs.ts";
import { useTab } from "./lib/useTab.ts";
import { useTheme } from "./features/settings/useTheme.ts";
import { useAccent } from "./features/settings/useAccent.ts";
import { useTint } from "./features/settings/useTint.ts";
import { useUpdate } from "./features/update/useUpdate.ts";
import { Loader, Logo, PageHeader, TooltipLayer } from "./ui/index.ts";
import { updateLabel } from "./features/update/updateFlow.ts";

const NO_THREADS: DashboardThread[] = [];
const NO_IDS: string[] = [];
// Same breakpoint as the bottom bar in styles.css.
const PHONE = "(max-width: 700px)";
// No room for the Notifications column: it becomes a side sheet.
const SHEET = "(max-width: 1200px)";

export function App() {
  const { state, sseDown, remoteSessions, remoteSeen, connects } = useDashboard();
  const [tab, setTab] = useTab();
  // Always loaded while live: it feeds the Automations badge and the automation icon, besides the page.
  const threadIds = useMemo(() => state?.threads.map((t) => t.id) ?? NO_IDS, [state?.threads]);
  const automations = useAutomations(state?.connection.t3 === "live", threadIds);
  const news = useNews(tab === "news");
  const [sessions, dispatchSessions] = useSessions();
  const compact = useMediaQuery(PHONE);
  const sheetMode = useMediaQuery(SHEET);
  const [listPrefs, setListPrefs] = useListPrefs();
  // On a phone the Sessions tab is a list; an opened session covers it, with no header or bottom bar.
  const [phoneSession, setPhoneSession] = useState(false);
  const sessionShown = compact && tab === "sessions" && phoneSession && sessions.focusedId !== null;
  // Only a session in front of the user counts as read or watched: on a phone, not the list.
  const inFront = tab === "sessions" && (!compact || sessionShown) ? sessions.focusedId : null;
  const [openHistory, recordOpened] = useOpenHistory();
  useSessionsSync({
    sessions,
    dispatch: dispatchSessions,
    threads: state?.connection.t3 === "live" ? state.threads : null,
    remote: remoteSessions,
    connects,
  });
  const watching = useRef<(id: string) => boolean>(() => false);
  watching.current = (id) => inFront === id;
  const notify = useNotifications({
    threads: state?.connection.t3 === "live" ? state.threads : null,
    quiet: useCallback((id: string) => watching.current(id), []),
    remote: remoteSeen,
    connects,
  });
  // The session in front of the user is read: on a click, a restore, and on each new activity.
  const readAt = inFront ? state?.threads.find((t) => t.id === inFront)?.lastActivityAt : undefined;
  const { markSeen, seenReady } = notify;
  useEffect(() => {
    if (inFront && readAt && seenReady) markSeen(inFront);
  }, [inFront, readAt, seenReady, markSeen]);
  // null: closed; otherwise open, with the project to preselect, if any.
  const [creating, setCreating] = useState<{ projectId: string | null } | null>(null);
  const [creatingAutomation, setCreatingAutomation] = useState(false);
  const [newsSettingsOpen, setNewsSettingsOpen] = useState(false);
  const [addingProject, setAddingProject] = useState(false);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [deletingProject, setDeletingProject] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmingUpdate, setConfirmingUpdate] = useState(false);
  // null: closed; a string: open, seeded with that query.
  const [switcherQuery, setSwitcherQuery] = useState<string | null>(null);
  const update = useUpdate();
  const [linearVersion, setLinearVersion] = useState(0);
  const [theme, setTheme] = useTheme();
  const [accent, setAccent] = useAccent();
  const [tint, setTint] = useTint();
  const [layout, setLayout] = useSessionLayout();
  const [now, setNow] = useState(() => new Date());
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed();

  // The error banner and the automations toolbar start under the header, whatever its height.
  const header = useRef<HTMLElement>(null);
  const hasHeader = !state?.connection.setup;
  useLayoutEffect(() => {
    const el = header.current;
    if (!el) return;
    const set = () => document.documentElement.style.setProperty("--header-h", `${el.offsetHeight}px`);
    set();
    const observer = new ResizeObserver(set);
    // Border box: the phone header's top padding follows the safe area, and a padding-only change (rotation) leaves the content box as is.
    observer.observe(el, { box: "border-box" });
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--header-h");
    };
  }, [hasHeader]);

  useKeyboardClass();

  // Relative times and the 24 h window need a clock that moves.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  function openInSessions(id: string, showSessions: boolean) {
    dispatchSessions({ type: "open", id });
    recordOpened(id);
    notify.markSeen(id);
    if (!showSessions) return;
    setPhoneSession(true);
    setTab("sessions");
  }

  // The bottom bar's Sessions entry shows the list.
  const showTab = (next: typeof tab) => {
    if (next === "sessions") setPhoneSession(false);
    setTab(next);
  };
  const back = useCallback(() => setPhoneSession(false), []);

  // The rows are memoized: these callbacks keep one identity and call the latest handlers.
  const openRef = useRef(openInSessions);
  openRef.current = openInSessions;
  const onOpen = useCallback((id: string, addOnly: boolean) => openRef.current(id, !addOnly), []);
  const openSession = useCallback((id: string) => openRef.current(id, true), []);
  const newSession = useCallback((projectId: string) => setCreating({ projectId }), []);
  const onSettle = useCallback((id: string, settle: boolean) => (settle ? api.settle(id) : api.unsettle(id)), []);

  const openSearch = () => {
    if (state) setSwitcherQuery("");
  };

  const editedProject = state?.projects.find((p) => p.id === editingProject);
  const deletedProject = state?.projects.find((p) => p.id === deletingProject);
  const blocked = creating !== null || creatingAutomation || newsSettingsOpen || addingProject || editedProject !== undefined || deletedProject !== undefined || settingsOpen || confirmingUpdate || switcherQuery !== null;
  useShortcuts(
    (action) => {
      if (action === "dashboard" || action === "sessions" || action === "automations" || action === "news") setTab(action);
      else if (action === "settings") setSettingsOpen(true);
      else if (action === "toggle-sidebar") {
        if (!compact) toggleSidebar();
      } else if (action === "switcher") {
        if (state && creating === null && !creatingAutomation && !settingsOpen && !confirmingUpdate) setSwitcherQuery((open) => (open === null ? "" : null));
      } else if (action === "new-session") {
        if (state) setCreating({ projectId: null });
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
      } else if (sessions.focusedId) {
        dispatchSessions({ type: action === "close-window" ? "close" : "maximize", id: sessions.focusedId });
      }
    },
    blocked,
    tab === "sessions",
  );

  const live = !sseDown && state?.connection.t3 === "live";
  const sessionIds = useMemo(() => new Set(sessions.ids), [sessions.ids]);
  const threads = state?.threads ?? NO_THREADS;
  const setup = useSetupRows(threads, automations.result?.setupThreadIds, automations.reload);
  const automationThreads = useMemo(() => new Set(automations.result?.automationThreadIds ?? NO_IDS), [automations.result?.automationThreadIds]);
  const threadsById = useMemo(() => new Map(threads.map((t) => [t.id, t])), [threads]);
  const automationsNav = useMemo(() => automationsBadge(automations.result?.automations ?? [], threadsById, notify.seen), [automations.result?.automations, threadsById, notify.seen]);
  const unread = useMemo(() => attentionCount(threadSections(threads, notify.seen)), [threads, notify.seen]);
  const agents = useMemo(() => agentCounts(threads), [threads]);
  const newsUnread = useMemo(() => unreadNewsCount(news.state?.articles ?? [], notify.seen), [news.state?.articles, notify.seen]);
  // A new identity once the seen state is known, so the page marks its open article again then.
  const { markRead, seenReady: ready } = notify;
  const readNews = useCallback((mark: { id: string; at: string }) => ready && markRead(mark), [ready, markRead]);
  const sessionsBadge = useMemo(() => ({ count: sessionsBadgeCount(threads, notify.seen), waiting: agents.waiting > 0 }), [threads, notify.seen, agents.waiting]);
  const dashboardLayout = useDashboardLayout(tab === "dashboard");
  const notifPanel = useNotificationsPanel(sheetMode, tab === "dashboard");
  const dashboardOpen = tab === "dashboard" && state !== null;
  // The sheet locks the page scroll while it shows.
  const sheetShown = sheetMode && notifPanel.open && dashboardOpen && !dashboardLayout.editing;
  const closeSheet = () => {
    notifPanel.close();
    document.querySelector<HTMLElement>(".notif-bell")?.focus();
  };
  // A hidden card reads nothing; showing it again reads at once.
  const cardShown = (id: DashboardCard) => dashboardOpen && !dashboardLayout.layout.hidden.includes(id);
  const activity = useActivity(cardShown("activity"));
  const limits = useLimits(cardShown("usage"));
  const server = useServerStats(cardShown("server"));
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
    <AutomationThreadsContext.Provider value={automationThreads}>
      <div className={`app${tab === "sessions" ? " sessions-mode" : ""}${tab === "automations" ? " automations-mode" : ""}${sessionShown ? " session-shown" : ""}${sheetShown ? " sheet-shown" : ""}`}>
        <TooltipLayer />
        <AppNav
          layout={compact ? "bottom" : "side"}
          collapsed={sidebarCollapsed}
          onToggleCollapsed={toggleSidebar}
          tab={tab}
          unread={unread}
          sessions={sessionsBadge}
          automations={automationsNav}
          news={newsUnread}
          live={live}
          update={updateNav}
          onTab={showTab}
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
                ready={state !== null && (tab !== "news" || news.state !== null)}
                editingLayout={dashboardLayout.editing}
                layoutIsDefault={isDefaultLayout(dashboardLayout.layout)}
                layout={layout}
                onLayoutChange={setLayout}
                listHidden={listPrefs.hidden}
                onToggleList={() => setListPrefs({ hidden: !listPrefs.hidden })}
                onNewSession={() => setCreating({ projectId: null })}
                onNewAutomation={() => setCreatingAutomation(true)}
                newsCanRun={news.state?.task != null}
                newsRunning={news.starting || news.writing}
                onNewsRun={() => void news.run()}
                onNewsSettings={() => setNewsSettingsOpen(true)}
                onSearch={openSearch}
                onSettings={() => setSettingsOpen(true)}
                updateReady={updateNav !== null}
                onEditLayout={() => dashboardLayout.setEditing(true)}
                onDoneLayout={() => dashboardLayout.setEditing(false)}
                onResetLayout={dashboardLayout.reset}
                unread={unread}
                notificationsOpen={notifPanel.open}
                onToggleNotifications={notifPanel.toggle}
              />
            }
          />
          <ConnectionBanner connection={state?.connection ?? null} sseDown={sseDown} />
          <NotificationToasts toasts={notify.toasts} projects={state?.projects ?? []} onOpen={(id) => openInSessions(id, true)} onDismiss={notify.dismiss} />
          <main>
            {tab === "dashboard" &&
              (state ? (
                <DashboardView
                  state={state}
                  limits={limits}
                  server={server}
                  activity={activity}
                  now={now}
                  sessionIds={sessionIds}
                  layout={dashboardLayout.layout}
                  editing={dashboardLayout.editing}
                  onLayout={dashboardLayout.setLayout}
                  panelOpen={notifPanel.open}
                  sheet={sheetMode}
                  onCloseSheet={closeSheet}
                  onOpen={onOpen}
                  onSettle={onSettle}
                  seen={notify.seen}
                  seenReady={notify.seenReady}
                  onMarkRead={notify.markSeen}
                  linearVersion={linearVersion}
                />
              ) : <Loader />)}
            {tab === "automations" &&
              (state ? (
                <AutomationsView
                  state={state}
                  now={now}
                  seen={notify.seen}
                  onOpen={onOpen}
                  automations={automations.result}
                  automationsError={automations.error}
                  onAutomationsStale={automations.reload}
                  onNewAutomation={() => setCreatingAutomation(true)}
                  setup={setup}
                />
              ) : <Loader />)}
            {tab === "news" && (news.state ? <NewsView news={news.state} writing={news.writing} now={now} compact={compact} onRead={readNews} onOpenThread={onOpen} /> : <Loader />)}
            {tab === "sessions" &&
              (state ? (
                <SessionsView
                  sessions={sessions}
                  dispatch={dispatchSessions}
                  threads={state.threads}
                  projects={state.projects}
                  seen={notify.seen}
                  now={now}
                  layout={layout}
                  prefs={listPrefs}
                  onPrefs={setListPrefs}
                  t3EnvironmentId={state.t3EnvironmentId}
                  providers={state.providers}
                  phone={compact}
                  sessionShown={sessionShown}
                  onBack={back}
                  onOpen={openSession}
                  onNewSession={newSession}
                  onAddProject={() => setAddingProject(true)}
                  onEditProject={setEditingProject}
                  onDeleteProject={setDeletingProject}
                />
              ) : <Loader />)}
          </main>
        </div>
        {state && creating && (
          <NewThreadDialog
            projects={state.projects}
            providers={state.providers}
            defaults={state.modelDefaults}
            projectId={creating.projectId}
            onClose={() => setCreating(null)}
            onCreated={(id) => {
              setCreating(null);
              openInSessions(id, true);
            }}
          />
        )}
        {addingProject && <AddProjectDialog onClose={() => setAddingProject(false)} onCreated={() => setAddingProject(false)} />}
        {editedProject && <EditProjectDialog key={editedProject.id} project={editedProject} onClose={() => setEditingProject(null)} />}
        {deletedProject && (
          <DeleteProjectDialog project={deletedProject} sessions={state?.threads.filter((t) => t.projectId === deletedProject.id).length ?? 0} onClose={() => setDeletingProject(null)} />
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
        {state && news.state && newsSettingsOpen && (
          <NewsSettingsDialog settings={news.state.settings} providers={state.providers} defaults={state.modelDefaults} onSave={news.save} onClose={() => setNewsSettingsOpen(false)} />
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
            tint={tint}
            onTintChange={setTint}
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
    </AutomationThreadsContext.Provider>
  );
}
