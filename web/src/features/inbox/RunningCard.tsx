import type { ReactNode } from "react";
import { CardHead } from "./CardHead.tsx";

export function RunningCard({ count, children }: { count: number; children: ReactNode }) {
  return (
    <section className="home-card" aria-labelledby="running-head">
      <CardHead id="running-head" icon="bolt" title="Running" count={count} />
      {count === 0 ? <p className="card-empty">No agent is running.</p> : <div className="run-list">{children}</div>}
    </section>
  );
}
