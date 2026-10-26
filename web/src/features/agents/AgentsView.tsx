import { useState, type ReactNode } from "react";
import type { AutomationsResult, DashboardState } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { groupAgents } from "../../lib/threads.ts";
import { excludeRoutineThreads } from "./automations.ts";
import { AgentCard } from "./AgentCard.tsx";
import { AutomationsColumn } from "./AutomationsColumn.tsx";
import { ProjectIcon } from "../../lib/ProjectIcon.tsx";
import { Icon, Kbd, Loader, Pressable, TextInput } from "../../ui/index.ts";

interface Props {
  state: DashboardState;
  now: Date;
  deskIds: ReadonlySet<string>;
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  onSettle: (id: string, settle: boolean) => Promise<unknown>;
  onSwitcher: (initialQuery: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
}

// Collapsed by default: settled threads need no attention.
function RecentlySettled({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="settled">
      <Pressable className="settled-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />
        Recently settled ({count})
      </Pressable>
      {open && <div className="grid">{children}</div>}
    </div>
  );
}

export function AgentsView({ state, now, deskIds, onOpen, onToggleDesk, onSettle, onSwitcher, automations, automationsError }: Props) {
  const groups = groupAgents(excludeRoutineThreads(state.threads, automations?.automations ?? []), state.projects, now);
  // Before the first automations answer, routine threads would flash in the grid.
  const available = state.automationsAvailable;
  const loading = available && automations === null && automationsError === null;
  const agents = loading ? (
    <Loader />
  ) : groups.length === 0 ? (
      <div className="empty-state">
        <strong>No active agents</strong>
        <span>Every thread that is not archived in T3 Code appears here.</span>
      </div>
    ) : (
      <div className="agents-groups">
        {groups.map((g) => (
          <section className="group" key={g.project.id}>
            <h2>
              <ProjectIcon icon={g.project.icon} />
              {g.project.title}
              {g.cards.some((c) => c.status === "waiting") && <span className="group-alert" role="img" aria-label="An agent is waiting for your reply" />} <span className="count">{g.cards.length + g.settled.length}</span>
            </h2>
            {g.cards.length > 0 && (
              <div className="grid">
                {g.cards.map((c) => (
                  <AgentCard key={c.thread.id} card={c} now={now} onDesk={deskIds.has(c.thread.id)} t3EnvironmentId={state.t3EnvironmentId} onOpen={onOpen} onToggleDesk={onToggleDesk} onSettle={onSettle} />
                ))}
              </div>
            )}
            {g.settled.length > 0 && (
              <RecentlySettled count={g.settled.length}>
                {g.settled.map((t) => (
                  <AgentCard key={t.id} card={{ thread: t, status: agentStatus(t) }} now={now} onDesk={deskIds.has(t.id)} t3EnvironmentId={state.t3EnvironmentId} onOpen={onOpen} onToggleDesk={onToggleDesk} onSettle={onSettle} />
                ))}
              </RecentlySettled>
            )}
          </section>
        ))}
      </div>
    );
  return (
    <div className="agents-page">
      <div className="agents-switcher">
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
      <div className={`agents-layout${available ? "" : " wide"}`}>
        {agents}
        {available && <AutomationsColumn result={automations} error={automationsError} threads={state.threads} now={now} onOpen={onOpen} />}
      </div>
    </div>
  );
}
