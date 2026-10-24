import type { DashboardState } from "../../../shared/api.ts";
import { groupAgents } from "../agents.ts";
import { AgentCard } from "./AgentCard.tsx";

interface Props {
  state: DashboardState;
  now: Date;
  selectedId: string | null;
  onOpen: (id: string) => void;
}

export function AgentsView({ state, now, selectedId, onOpen }: Props) {
  const groups = groupAgents(state.threads, state.projects, now);
  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <strong>Aucun agent actif</strong>
        <span>Les agents en attente, au travail ou terminés depuis moins de 24 h apparaissent ici.</span>
      </div>
    );
  }
  return (
    <>
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
    </>
  );
}
