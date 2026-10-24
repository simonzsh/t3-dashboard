import type { DashboardProject, DashboardThread } from "../../../shared/api.ts";
import { byDay, byProject, byProvider, type Count } from "../stats.ts";

const ROW = 24;
const LABEL_W = 150;
const W = 460;

function BarChart({ title, rows }: { title: string; rows: Count[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const plot = W - LABEL_W - 40;
  return (
    <figure className="chart">
      <figcaption>{title}</figcaption>
      {rows.length === 0 ? (
        <p className="empty">Aucune donnée</p>
      ) : (
        <svg viewBox={`0 0 ${W} ${rows.length * ROW + 4}`} role="img" aria-label={title}>
          {rows.map((r, i) => {
            const w = Math.max(2, (r.count / max) * plot);
            return (
              <g key={r.label} transform={`translate(0 ${i * ROW + 2})`}>
                <title>{`${r.label} : ${r.count}`}</title>
                <text x={LABEL_W - 8} y={ROW / 2} textAnchor="end" dominantBaseline="middle" className="axis-label">
                  {r.label.length > 22 ? `${r.label.slice(0, 21)}…` : r.label}
                </text>
                <rect x={LABEL_W} y={4} width={w} height={ROW - 10} rx={3} className="mark" />
                <text x={LABEL_W + w + 6} y={ROW / 2} dominantBaseline="middle" className="value-label">
                  {r.count}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </figure>
  );
}

function DayChart({ threads, now }: { threads: DashboardThread[]; now: Date }) {
  const days = byDay(threads, now, 30);
  const max = Math.max(1, ...days.map((d) => d.count));
  const H = 140;
  const left = 30;
  const bottom = 20;
  const step = (W - left) / days.length;
  const ticks = [0, Math.ceil(max / 2), max].filter((v, i, a) => a.indexOf(v) === i);
  return (
    <figure className="chart">
      <figcaption>Threads créés par jour (30 jours)</figcaption>
      <svg viewBox={`0 0 ${W} ${H + bottom}`} role="img" aria-label="Threads créés par jour">
        {ticks.map((v) => {
          const y = H - (v / max) * (H - 10);
          return (
            <g key={v}>
              <line x1={left} x2={W} y1={y} y2={y} className="grid" />
              <text x={left - 6} y={y} textAnchor="end" dominantBaseline="middle" className="axis-label">
                {v}
              </text>
            </g>
          );
        })}
        {days.map((d, i) => {
          const h = (d.count / max) * (H - 10);
          const x = left + i * step;
          return (
            <g key={d.day}>
              <title>{`${d.day} : ${d.count}`}</title>
              <rect x={x} y={0} width={step} height={H} className="hit" />
              {d.count > 0 && <rect x={x + 1} y={H - h} width={step - 2} height={h} rx={2} className="mark" />}
              {i % 5 === 0 && (
                <text x={x + step / 2} y={H + 14} textAnchor="middle" className="axis-label">
                  {d.day.slice(8)}/{d.day.slice(5, 7)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

export function Charts({ threads, projects, now }: { threads: DashboardThread[]; projects: DashboardProject[]; now: Date }) {
  return (
    <section className="charts" aria-label="Graphiques">
      <BarChart title="Threads par projet" rows={byProject(threads, projects)} />
      <DayChart threads={threads} now={now} />
      <BarChart title="Threads par provider" rows={byProvider(threads)} />
    </section>
  );
}
