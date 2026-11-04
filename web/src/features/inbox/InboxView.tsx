import { useMemo, useState, type ReactNode } from "react";
import type { AutomationsResult, DashboardState, DashboardThread } from "../../../../shared/api.ts";
import { useScrolled } from "../../lib/useScrolled.ts";
import { Icon, Kbd, Loader, Pressable, TextInput } from "../../ui/index.ts";
import { excludeRoutineThreads } from "../automations/automations.ts";
import { useSetupRows } from "../automations/useSetupRows.ts";
import { InboxRow, type RowActions } from "./InboxRow.tsx";
import { inboxSections, nothingToDo } from "./inbox.ts";
import { TicketsSection } from "./TicketsSection.tsx";
import { useTickets } from "./useTickets.ts";

interface Props {
  state: DashboardState;
  now: Date;
  deskIds: ReadonlySet<string>;
  // addOnly: put the agent on the Desk without leaving the Inbox.
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  onSwitcher: (initialQuery: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
  onAutomationsStale: () => Promise<void>;
  /** Changes when the Linear settings change: the tickets then load again. */
  linearVersion: number;
}

// Closed by default: running and settled threads need no action from the user.
function Collapsible({ title, count, className, children }: { title: string; count: number; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="inbox-section">
      <Pressable className={["inbox-collapse-head", className].filter(Boolean).join(" ")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />
        {title} ({count})
      </Pressable>
      {open && <div className="inbox-list">{children}</div>}
    </section>
  );
}

export function InboxView({ state, now, deskIds, onOpen, onToggleDesk, onSettle, onSwitcher, automations, automationsError, onAutomationsStale, linearVersion }: Props) {
  const scrolled = useScrolled();
  const hiddenIds = automations?.hiddenThreadIds;
  const setup = useSetupRows(state.threads, automations?.setupThreadIds, onAutomationsStale);
  const sections = useMemo(
    () => inboxSections(excludeRoutineThreads(state.threads, [...(hiddenIds ?? []), ...setup.map((t) => t.id)]), now),
    [state.threads, hiddenIds, setup, now],
  );
  const projects = useMemo(() => new Map(state.projects.map((p) => [p.id, p])), [state.projects]);
  const tickets = useTickets(linearVersion, state.threads);
  // Before the first automations answer, routine threads would flash in the lists.
  const loading = state.connection.t3 === "live" && automations === null && automationsError === null;

  const rows = (threads: DashboardThread[], actions: RowActions) =>
    threads.map((t) => (
      <InboxRow
        key={t.id}
        thread={t}
        project={projects.get(t.projectId)}
        now={now}
        actions={actions}
        onDesk={deskIds.has(t.id)}
        t3EnvironmentId={state.t3EnvironmentId}
        onOpen={onOpen}
        onToggleDesk={onToggleDesk}
        onSettle={onSettle}
      />
    ));
  const section = (id: string, title: string, threads: DashboardThread[], actions: RowActions, headClass?: string) =>
    threads.length > 0 && (
      <section className="inbox-section" aria-labelledby={id}>
        <h2 id={id} className={["inbox-heading", headClass].filter(Boolean).join(" ")}>
          {title} <span className="count">{threads.length}</span>
        </h2>
        <div className="inbox-list">{rows(threads, actions)}</div>
      </section>
    );

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
          {nothingToDo(sections, tickets.tickets.length) && (
            <div className="empty-state">
              <strong>Nothing needs you</strong>
              <span>Waiting agents, errors, finished work and new tickets show up here.</span>
            </div>
          )}
          {section("inbox-waiting-head", "Waiting for you", sections.waiting, "open")}
          {section("inbox-errors-head", "Errors", sections.errors, "open-settle")}
          {section("inbox-finished-head", "Finished", sections.finished, "desk-settle", "inbox-finished-head")}
          <TicketsSection
            board={tickets.board}
            needsKey={tickets.needsKey}
            loading={tickets.loading}
            failed={tickets.failed}
            tickets={tickets.tickets}
            projects={state.projects}
            providers={state.providers}
            modelDefaults={state.modelDefaults}
            onOpen={onOpen}
            onStarted={tickets.markStarted}
            onRefresh={() => void tickets.reload(true)}
          />
          {sections.running.length > 0 && (
            <Collapsible title="Running" count={sections.running.length}>
              {rows(sections.running, "desk")}
            </Collapsible>
          )}
          {sections.settled.length > 0 && (
            <Collapsible title="Recently settled" count={sections.settled.length} className="inbox-settled-head">
              {rows(sections.settled, "unsettle")}
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
