import type { DashboardThread } from "../../../shared/api.ts";
import { BUCKET_LABELS, BUCKETS } from "../filters.ts";
import { kpis } from "../stats.ts";

export function Kpis({ threads }: { threads: DashboardThread[] }) {
  const k = kpis(threads);
  const tiles: Array<[string, number]> = [
    ["Threads", k.total],
    ...BUCKETS.map((b): [string, number] => [BUCKET_LABELS[b], k.buckets[b]]),
    ["Approbations en attente", k.approvals],
    ["Questions en attente", k.inputs],
  ];
  return (
    <section className="kpis" aria-label="Indicateurs">
      {tiles.map(([label, n]) => (
        <div className="kpi" key={label}>
          <b>{n}</b>
          <span>{label}</span>
        </div>
      ))}
    </section>
  );
}
