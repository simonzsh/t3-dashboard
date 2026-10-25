import { useState } from "react";
import type { AutomationsResult, DashboardState, DashboardThread } from "../../../shared/api.ts";
import { groupAgents } from "../agents.ts";
import { excludeRoutineThreads } from "../automations.ts";
import { relativeTime } from "../format.ts";
import { Pressable } from "../ui/index.ts";
import { AgentCard } from "./AgentCard.tsx";
import { AutomationsColumn } from "./AutomationsColumn.tsx";
import { ProviderIcon } from "./ProviderIcon.tsx";

interface Props {
  state: DashboardState;
  now: Date;
  deskIds: ReadonlySet<string>;
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
}

// Collapsed by default, as in the T3 Code sidebar: one line per thread.
function SettledList({ threads, now, onOpen }: { threads: DashboardThread[]; now: Date; onOpen: (id: string, addOnly: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="settled">
      <Pressable className="settled-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />
        Settled <span className="count">{threads.length}</span>
      </Pressable>
      {open && (
        <ul className="settled-list">
          {threads.map((t) => (
            <li key={t.id}>
              <Pressable className="settled-row" title={t.title || "(untitled)"} onClick={(e) => onOpen(t.id, e.shiftKey)}>
                <ProviderIcon provider={t.provider} />
                <span className="settled-title">{t.title || "(untitled)"}</span>
                <span className="settled-time">{relativeTime(t.lastActivityAt, now)}</span>
              </Pressable>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AgentsView({ state, now, deskIds, onOpen, onToggleDesk, automations, automationsError }: Props) {
  const groups = groupAgents(excludeRoutineThreads(state.threads, automations?.automations ?? []), state.projects);
  // Before the first automations answer, routine threads would flash in the grid.
  const available = state.automationsAvailable;
  const loading = available && automations === null && automationsError === null;
  const agents = loading ? (
    <div className="empty-state">Loading…</div>
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
              {g.project.title} <span className="count">{g.cards.length + g.settled.length}</span>
            </h2>
            {g.cards.length > 0 && (
              <div className="grid">
                {g.cards.map((c) => (
                  <AgentCard key={c.thread.id} card={c} now={now} onDesk={deskIds.has(c.thread.id)} t3EnvironmentId={state.t3EnvironmentId} onOpen={onOpen} onToggleDesk={onToggleDesk} />
                ))}
              </div>
            )}
            {g.settled.length > 0 && <SettledList threads={g.settled} now={now} onOpen={onOpen} />}
          </section>
        ))}
      </div>
    );
  return (
    <div className={`agents-layout${available ? "" : " wide"}`}>
      {agents}
      {available && <AutomationsColumn result={automations} error={automationsError} threads={state.threads} now={now} onOpen={onOpen} />}
    </div>
  );
}
