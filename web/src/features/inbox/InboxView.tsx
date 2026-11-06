import { useMemo, type ReactNode } from "react";
import type { AutomationsResult, DashboardState, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { useAction } from "../../lib/useAction.ts";
import { Button } from "../../ui/index.ts";
import { inboxSections, settleCandidates, type Notification } from "./inbox.ts";
import { NotificationItem } from "./NotificationItem.tsx";
import { NotificationsCard } from "./NotificationsCard.tsx";
import { RunningCard } from "./RunningCard.tsx";
import { ThreadRow } from "./ThreadRow.tsx";
import { UpNextCard } from "./TicketsSection.tsx";
import { useTickets } from "./useTickets.ts";

interface Props {
  state: DashboardState;
  /** The threads the Inbox lists: see `inboxThreads`. */
  visible: DashboardThread[];
  now: Date;
  deskIds: ReadonlySet<string>;
  // addOnly: put the agent on the Desk without leaving the Inbox.
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  seen: SeenState;
  /** False until the server answers: every thread would look read, and "Settle all" could settle unread ones. */
  seenReady: boolean;
  onMarkRead: (id: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  /** Changes when the Linear settings change: the tickets then load again. */
  linearVersion: number;
  /** Gets the cards, so the Home layout decides where each one goes. */
  children: (cards: InboxCards) => ReactNode;
}

export interface InboxCards {
  notifications: ReactNode;
  running: ReactNode;
  upNext: ReactNode;
}

// Settles every thread even when some fail, then reports how many failed.
async function settleEach(threads: DashboardThread[], onSettle: Props["onSettle"]): Promise<void> {
  const results = await Promise.allSettled(threads.map((t) => onSettle(t.id, true)));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) throw new Error(`${failed} of ${threads.length} failed.`);
}

export function InboxView({ state, visible, now, deskIds, onOpen, onToggleDesk, onSettle, seen, seenReady, onMarkRead, automations, automationsError, linearVersion, children }: Props) {
  const tickets = useTickets(linearVersion, visible, seen, now);
  const { relaunch, upNext } = tickets.plan;
  const sections = useMemo(
    () => inboxSections(visible, seen, now, new Set(relaunch.map((r) => r.thread.id))),
    [visible, seen, now, relaunch],
  );
  const projects = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);
  const modelNames = useMemo(() => new Map(state.providers.flatMap((p) => p.models).map((m) => [m.slug, m.name])), [state.providers]);
  const settleAll = useAction("settle the threads");
  const stale = settleCandidates(sections.readIdle, now);
  // Before the first automations answer, routine threads would flash in the lists.
  const loading = state.connection.t3 === "live" && ((automations === null && automationsError === null) || !seenReady);

  const settleButton = stale.length > 0 && (
    <Button
      size="sm"
      className="inbox-settle-all"
      loading={settleAll.busy}
      tooltip={settleAll.error ?? undefined}
      variant={settleAll.error ? "danger" : "secondary"}
      onClick={() => void settleAll.run(() => settleEach(stale, onSettle))}
    >
      Settle all older than 3 days ({stale.length})
    </Button>
  );

  const rowProps = (t: DashboardThread) => ({
    thread: t,
    project: projects.get(t.projectId),
    modelName: t.model && (modelNames.get(t.model) ?? t.model),
    now,
    onDesk: deskIds.has(t.id),
    t3EnvironmentId: state.t3EnvironmentId,
    onOpen,
    onToggleDesk,
    onSettle,
  });
  const threadRow = (t: DashboardThread) => <ThreadRow key={t.id} {...rowProps(t)} />;
  const ticketProps = { projects: state.projects, providers: state.providers, modelDefaults: state.modelDefaults, onOpen, onStarted: tickets.markStarted };

  return children({
    notifications: (
      <NotificationsCard
        sections={sections}
        now={now}
        loading={loading}
        renderItem={({ thread, kind }: Notification) => <NotificationItem key={thread.id} kind={kind} {...rowProps(thread)} />}
        onMarkAllRead={() => sections.unread.forEach((t) => onMarkRead(t.id))}
        settleAll={settleButton}
      />
    ),
    running: <RunningCard count={sections.running.length}>{sections.running.map(threadRow)}</RunningCard>,
    upNext: (
      <UpNextCard
        board={tickets.board}
        needsKey={tickets.needsKey}
        loading={tickets.loading}
        failed={tickets.failed}
        tickets={upNext}
        relaunch={relaunch.map(({ thread }) => threadRow(thread))}
        relaunchCount={relaunch.length}
        onRefresh={() => void tickets.reload(true)}
        {...ticketProps}
      />
    ),
  });
}
