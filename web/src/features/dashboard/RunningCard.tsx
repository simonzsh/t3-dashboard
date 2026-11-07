import type { ReactNode } from "react";
import { CardHead } from "../../ui/index.ts";
import { SkeletonRows } from "./SkeletonRows.tsx";

export function RunningCard({ count, loading, children }: { count: number; loading: boolean; children: ReactNode }) {
  return (
    <section className="dashboard-card" aria-labelledby="running-head">
      <CardHead
        id="running-head"
        icon="bolt"
        title="Running"
        count={count}
        actions={
          <span className="card-live">
            <span className="live-dot" aria-hidden="true" />
            Live
          </span>
        }
      />
      {loading ? <SkeletonRows label="Loading running agents" rows={3} /> : count === 0 ? <p className="card-empty">No agent is running.</p> : <div className="run-list">{children}</div>}
    </section>
  );
}
