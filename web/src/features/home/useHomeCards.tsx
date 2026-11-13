import { useMemo, type ReactNode } from "react";
import type { DashboardState, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { modelLabel, modelNameMap } from "../../lib/models.ts";
import { NotificationItem } from "./NotificationItem.tsx";
import { NotificationsCard } from "./NotificationsCard.tsx";
import { RunningCard } from "./RunningCard.tsx";
import { LinearCard } from "./LinearCard.tsx";
import { threadSections } from "./sections.ts";
import { ThreadRow } from "./ThreadRow.tsx";
import { useLinear } from "./useLinear.ts";

export interface CardsInput {
  state: DashboardState;
  now: Date;
  sessionIds: ReadonlySet<string>;
  // addOnly: put the agent on the Sessions page without leaving Home.
  onOpen: (id: string, addOnly: boolean) => void;
  seen: SeenState;
  /** False until the server answers: unread results are not known yet. */
  seenReady: boolean;
  onMarkRead: (id: string) => void;
  /** Changes when the Linear settings change: the board then loads again. */
  linearVersion: number;
}

/** The thread cards of Home and the Notifications panel; Usage, Machine and Activity need no thread. */
export function useHomeCards({ state, now, sessionIds, onOpen, seen, seenReady, onMarkRead, linearVersion }: CardsInput, linearEnabled: boolean): Record<"notifications" | "running" | "linear", ReactNode> {
  const threads = state.threads;
  const linear = useLinear(linearVersion, linearEnabled);
  const sections = useMemo(() => threadSections(threads, seen), [threads, seen]);
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
        loading={loading}
        renderItem={({ thread, kind }) => <NotificationItem key={thread.id} kind={kind} {...rowProps(thread)} onMarkRead={onMarkRead} />}
        onMarkAllRead={() => sections.unread.forEach((t) => onMarkRead(t.id))}
      />
    ),
    running: (
      <RunningCard count={sections.running.length} loading={loading}>
        {sections.running.map(threadRow)}
      </RunningCard>
    ),
    // Null until Linear is known to be connected: the dashboard then leaves no slot for the card.
    linear:
      linear.board && linear.shown ? (
        <LinearCard
          board={linear.board}
          now={now}
          loading={linear.loading}
          threads={threads}
          started={linear.started}
          onRefresh={() => void linear.reload(true)}
          projects={state.projects}
          providers={state.providers}
          modelDefaults={state.modelDefaults}
          onOpen={onOpen}
          onStarted={linear.markStarted}
        />
      ) : null,
  };
}
