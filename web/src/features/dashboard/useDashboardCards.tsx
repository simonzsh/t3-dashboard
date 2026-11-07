import { useMemo, type ReactNode } from "react";
import type { DashboardState, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { modelLabel, modelNameMap } from "../../lib/models.ts";
import { NotificationItem } from "./NotificationItem.tsx";
import { NotificationsCard } from "./NotificationsCard.tsx";
import { RunningCard } from "./RunningCard.tsx";
import { threadSections, splitRead } from "./sections.ts";
import { ThreadRow } from "./ThreadRow.tsx";
import { UpNextCard } from "./UpNextCard.tsx";
import { useTickets } from "./useTickets.ts";

export interface CardsInput {
  state: DashboardState;
  now: Date;
  sessionIds: ReadonlySet<string>;
  // addOnly: put the agent on the Sessions page without leaving the Dashboard.
  onOpen: (id: string, addOnly: boolean) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  seen: SeenState;
  /** False until the server answers: every thread would look read, and "Settle all" could settle unread ones. */
  seenReady: boolean;
  onMarkRead: (id: string) => void;
  /** Changes when the Linear settings change: the tickets then load again. */
  linearVersion: number;
}

/** The thread cards of the Dashboard and the Notifications panel; Usage, Server and Activity need no thread. */
export function useDashboardCards({ state, now, sessionIds, onOpen, onSettle, seen, seenReady, onMarkRead, linearVersion }: CardsInput, ticketsShown: boolean): Record<"notifications" | "running" | "up-next", ReactNode> {
  const threads = state.threads;
  const tickets = useTickets(linearVersion, ticketsShown, threads, seen, now);
  const { relaunch, upNext } = tickets.plan;
  const sections = useMemo(() => threadSections(threads, seen, new Set(relaunch.map((r) => r.thread.id))), [threads, seen, relaunch]);
  const { recent, old } = useMemo(() => splitRead(sections.readIdle, now), [sections, now]);
  const projects = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);
  const modelNames = useMemo(() => modelNameMap(state.providers), [state.providers]);
  const loading = state.connection.t3 === "live" && !seenReady;

  const rowProps = (t: DashboardThread) => ({
    thread: t,
    project: projects.get(t.projectId),
    modelName: modelLabel(t.model, modelNames),
    now,
    inSessions: sessionIds.has(t.id),
    onOpen,
  });
  const threadRow = (t: DashboardThread) => <ThreadRow key={t.id} {...rowProps(t)} />;

  return {
    notifications: (
      <NotificationsCard
        sections={sections}
        recent={recent}
        old={old}
        loading={loading}
        renderItem={({ thread, kind }) => <NotificationItem key={thread.id} kind={kind} {...rowProps(thread)} onMarkRead={onMarkRead} />}
        onMarkAllRead={() => sections.unread.forEach((t) => onMarkRead(t.id))}
        onSettle={onSettle}
      />
    ),
    running: (
      <RunningCard count={sections.running.length} loading={loading}>
        {sections.running.map(threadRow)}
      </RunningCard>
    ),
    "up-next": (
      <UpNextCard
        board={tickets.board}
        now={now}
        needsKey={tickets.needsKey}
        loading={tickets.loading}
        failed={tickets.failed}
        tickets={upNext}
        relaunch={relaunch.map(({ thread }) => threadRow(thread))}
        onRefresh={() => void tickets.reload(true)}
        projects={state.projects}
        providers={state.providers}
        modelDefaults={state.modelDefaults}
        onOpen={onOpen}
        onStarted={tickets.markStarted}
      />
    ),
  };
}
