import type { AutomationsResult, DashboardState } from "../../../shared/api.ts";
import { groupAgents } from "../agents.ts";
import { excludeRoutineThreads } from "../automations.ts";
import { AgentCard } from "./AgentCard.tsx";
import { AutomationsColumn } from "./AutomationsColumn.tsx";

interface Props {
  state: DashboardState;
  now: Date;
  deskIds: ReadonlySet<string>;
  onOpen: (id: string, addOnly: boolean) => void;
  onToggleDesk: (id: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
}

export function AgentsView({ state, now, deskIds, onOpen, onToggleDesk, automations, automationsError }: Props) {
  const groups = groupAgents(excludeRoutineThreads(state.threads, automations?.automations ?? []), state.projects, now);
  // Before the first automations answer, routine threads would flash in the grid.
  const available = state.automationsAvailable;
  const loading = available && automations === null && automationsError === null;
  const agents = loading ? (
    <div className="empty-state">Loading…</div>
  ) : groups.length === 0 ? (
      <div className="empty-state">
        <strong>No active agents</strong>
        <span>Agents that are waiting, running or finished in the last 24 h appear here.</span>
      </div>
    ) : (
      <div className="agents-groups">
        {groups.map((g) => (
          <section className="group" key={g.project.id}>
            <h2>
              {g.project.title} <span className="count">{g.cards.length}</span>
            </h2>
            <div className="grid">
              {g.cards.map((c) => (
                <AgentCard key={c.thread.id} card={c} now={now} onDesk={deskIds.has(c.thread.id)} onOpen={onOpen} onToggleDesk={onToggleDesk} />
              ))}
            </div>
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
