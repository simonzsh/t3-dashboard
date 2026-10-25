import type { AutomationsResult, DashboardState } from "../../../shared/api.ts";
import { groupAgents } from "../agents.ts";
import { excludeRoutineThreads } from "../automations.ts";
import { AgentCard } from "./AgentCard.tsx";
import { AutomationsColumn } from "./AutomationsColumn.tsx";

interface Props {
  state: DashboardState;
  now: Date;
  selectedId: string | null;
  onOpen: (id: string) => void;
  automations: AutomationsResult | null;
  automationsError: string | null;
}

export function AgentsView({ state, now, selectedId, onOpen, automations, automationsError }: Props) {
  const groups = groupAgents(excludeRoutineThreads(state.threads, automations?.automations ?? []), state.projects, now);
  // Before the first automations answer, routine threads would flash in the grid.
  const loading = automations === null && automationsError === null;
  const agents = loading ? (
    <div className="empty-state">Chargement…</div>
  ) : groups.length === 0 ? (
      <div className="empty-state">
        <strong>Aucun agent actif</strong>
        <span>Les agents en attente, au travail ou terminés depuis moins de 24 h apparaissent ici.</span>
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
                <AgentCard key={c.thread.id} card={c} now={now} selected={c.thread.id === selectedId} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))}
      </div>
    );
  return (
    <div className="agents-layout">
      {agents}
      <AutomationsColumn result={automations} error={automationsError} threads={state.threads} now={now} onOpen={onOpen} />
    </div>
  );
}
