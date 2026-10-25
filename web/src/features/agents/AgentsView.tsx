import type { AutomationsResult, DashboardState } from "../../../../shared/api.ts";
import { agentStatus } from "../../../../shared/status.ts";
import { groupAgents } from "../../lib/threads.ts";
import { excludeRoutineThreads } from "./automations.ts";
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
            {g.settled.length > 0 && (
              <div className="settled">
                <h3 className="settled-head">Recently settled ({g.settled.length})</h3>
                <div className="grid compact">
                  {g.settled.map((t) => (
                    <AgentCard key={t.id} card={{ thread: t, status: agentStatus(t) }} compact now={now} onDesk={deskIds.has(t.id)} t3EnvironmentId={state.t3EnvironmentId} onOpen={onOpen} onToggleDesk={onToggleDesk} />
                  ))}
                </div>
              </div>
            )}
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
