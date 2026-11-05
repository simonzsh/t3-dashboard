import { useMemo } from "react";
import type { AutomationsResult, DashboardState, DashboardThread } from "../../../../shared/api.ts";
import type { SeenState } from "../../../../shared/seen.ts";
import { useAction } from "../../lib/useAction.ts";
import { useScrolled } from "../../lib/useScrolled.ts";
import { Button, Icon, Kbd, Loader, TextInput } from "../../ui/index.ts";
import { InboxRow } from "./InboxRow.tsx";
import { Collapsible, Section } from "./InboxSection.tsx";
import { SECTION_LIMIT, inboxSections, inboxSummary, nothingToDo, settleCandidates } from "./inbox.ts";
import { UpNextSection } from "./TicketsSection.tsx";
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
  onSwitcher: (initialQuery: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  /** Changes when the Linear settings change: the tickets then load again. */
  linearVersion: number;
}

// Settles every thread even when some fail, then reports how many failed.
async function settleEach(threads: DashboardThread[], onSettle: Props["onSettle"]): Promise<void> {
  const results = await Promise.allSettled(threads.map((t) => onSettle(t.id, true)));
  const failed = results.filter((r) => r.status === "rejected").length;
  if (failed > 0) throw new Error(`${failed} of ${threads.length} failed.`);
}

export function InboxView({ state, visible, now, deskIds, onOpen, onToggleDesk, onSettle, seen, seenReady, onMarkRead, onSwitcher, automations, automationsError, linearVersion }: Props) {
  const scrolled = useScrolled();
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

  const row = (t: DashboardThread) => (
    <InboxRow
      key={t.id}
      thread={t}
      project={projects.get(t.projectId)}
      modelName={t.model && (modelNames.get(t.model) ?? t.model)}
      now={now}
      onDesk={deskIds.has(t.id)}
      t3EnvironmentId={state.t3EnvironmentId}
      onOpen={onOpen}
      onToggleDesk={onToggleDesk}
      onSettle={onSettle}
    />
  );
  const rows = (threads: DashboardThread[]) => threads.map(row);
  const summary = inboxSummary(sections.needsYou.length, sections.unread.length, relaunch.length);
  const ticketProps = { projects: state.projects, providers: state.providers, modelDefaults: state.modelDefaults, onOpen, onStarted: tickets.markStarted };

  return (
    <div className="inbox-page">
      <div className={`inbox-switcher${scrolled ? " scrolled" : ""}`}>
        <Icon name="search" />
        {/* No onFocus: the dialog gives focus back here on close and would reopen. */}
        <TextInput
          readOnly
          aria-label="Jump to a conversation"
          placeholder="Jump to a conversation…"
          onClick={() => onSwitcher("")}
          onKeyDown={(e) => {
            if (e.ctrlKey || e.metaKey || e.altKey || (e.key !== "Enter" && e.key.length !== 1)) return;
            e.preventDefault();
            onSwitcher(e.key === "Enter" ? "" : e.key);
          }}
        />
        <Kbd>{navigator.platform.startsWith("Mac") ? "⌘K" : "Ctrl K"}</Kbd>
      </div>
      {loading ? (
        <Loader />
      ) : (
        <div className="inbox-sections">
          {summary && <p className="inbox-summary">{summary}</p>}
          {nothingToDo(sections, relaunch.length, upNext.length) && (
            <div className="empty-state">
              <strong>Nothing needs you</strong>
              <span>Waiting agents, errors, unread results and tickets show up here.</span>
            </div>
          )}
          <Section id="inbox-needs-head" title="Needs you" count={sections.needsYou.length} limit={SECTION_LIMIT}>
            {rows(sections.needsYou)}
          </Section>
          <Section
            id="inbox-unread-head"
            title="Unread"
            count={sections.unread.length}
            limit={SECTION_LIMIT}
            headClass="inbox-unread-head"
            action={
              <Button variant="ghost" size="sm" onClick={() => sections.unread.forEach((t) => onMarkRead(t.id))}>
                Mark all read
              </Button>
            }
          >
            {rows(sections.unread)}
          </Section>
          <Section id="inbox-relaunch-head" title="To relaunch" count={relaunch.length}>
            {relaunch.map(({ thread }) => row(thread))}
          </Section>
          <Section id="inbox-running-head" title="Running" count={sections.running.length}>
            {rows(sections.running)}
          </Section>
          <UpNextSection
            board={tickets.board}
            needsKey={tickets.needsKey}
            loading={tickets.loading}
            failed={tickets.failed}
            tickets={upNext}
            onRefresh={() => void tickets.reload(true)}
            {...ticketProps}
          />
          <Collapsible title="Read and idle" count={sections.readIdle.length} limit={SECTION_LIMIT} before={settleButton}>
            {rows(sections.readIdle)}
          </Collapsible>
          <Collapsible title="Recently settled" count={sections.settled.length} className="inbox-settled-head" limit={SECTION_LIMIT}>
            {rows(sections.settled)}
          </Collapsible>
        </div>
      )}
    </div>
  );
}
