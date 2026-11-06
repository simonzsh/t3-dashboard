import { useEffect, useRef, useState } from "react";
import type { UsageDay } from "../../../../shared/api.ts";
import { barLayout, cacheShare, formatCompact, formatMetric, formatUsd, metricValue, niceTicks, shortDay, tokensOf, type Metric } from "./usageView.ts";

const HEIGHT = 190;
const MARGIN = { top: 10, right: 20, bottom: 24, left: 52 };
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const START_WIDTH = 640;
const LABELS: Record<Metric, string> = { turns: "Turns", cost: "Spend", tokens: "Tokens" };

// Rounded 4 px at the data end only; the base sits on the axis.
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, height, width / 2);
  return `M${x},${y + r}a${r},${r} 0 0 1 ${r},${-r}h${width - 2 * r}a${r},${r} 0 0 1 ${r},${r}V${y + height}h${-width}Z`;
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(START_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setWidth(Math.max(240, el.clientWidth));
    set();
    const observer = new ResizeObserver(set);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

function describe(d: UsageDay, costKnown: boolean): string {
  const cost = costKnown ? formatUsd(d.costUsd) : "no cost data";
  return `${shortDay(d.day)}: ${d.turns} turns, ${cost}, ${formatCompact(tokensOf(d))} tokens`;
}

interface Props {
  days: UsageDay[];
  metric: Metric;
  /** False when T3 sent no usage: cost and tokens are then not real zeros. */
  costKnown: boolean;
}

/** Bars for the last days, one series. The values also sit in a table for screen readers. */
export function UsageChart({ days, metric, costKnown }: Props) {
  const [ref, width] = useWidth();
  const [active, setActive] = useState<number | null>(null);
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const values = days.map((d) => metricValue(d, metric));
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks.at(-1)!;
  const bars = barLayout(values, top, PLOT_HEIGHT, plotWidth);
  const slot = plotWidth / days.length;
  // Fewer labels on a narrow screen, always including today.
  const every = width < 480 ? 3 : 2;
  const hovered = active === null ? null : days[active]!;
  const tipLeft = active === null ? 0 : MARGIN.left + (active + 0.5) * slot;

  return (
    <div className="usage-chart" ref={ref} onMouseLeave={() => setActive(null)}>
      <svg width={width} height={HEIGHT} role="group" aria-label={`${LABELS[metric]} per day, last ${days.length} days`}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((tick) => {
            const y = PLOT_HEIGHT - (tick / top) * PLOT_HEIGHT;
            return (
              <g key={tick}>
                <line className="usage-grid" x1={0} x2={plotWidth} y1={y} y2={y} />
                <text className="usage-axis" x={-8} y={y} textAnchor="end" dominantBaseline="middle">{formatMetric(tick, metric)}</text>
              </g>
            );
          })}
          {active !== null && <rect className="usage-hover" x={active * slot} y={0} width={slot} height={PLOT_HEIGHT} />}
          {bars.map((bar, i) => {
            const today = i === days.length - 1;
            return (
              <g key={days[i]!.day}>
                {bar.height > 0 ? (
                  <path className={`usage-bar${today ? " today" : ""}`} d={barPath(bar.x, bar.y, bar.width, bar.height)} />
                ) : (
                  <rect className="usage-zero" x={bar.x} y={PLOT_HEIGHT - 2} width={bar.width} height={2} rx={1} />
                )}
                {(days.length - 1 - i) % every === 0 && (
                  <text className={`usage-axis${today ? " today" : ""}`} x={i * slot + slot / 2} y={PLOT_HEIGHT + 16} textAnchor="middle">
                    {today ? "Today" : shortDay(days[i]!.day)}
                  </text>
                )}
                <rect
                  className="usage-hit"
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={PLOT_HEIGHT}
                  tabIndex={0}
                  role="img"
                  aria-label={describe(days[i]!, costKnown)}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                />
              </g>
            );
          })}
        </g>
      </svg>
      {hovered && (
        <div className="usage-tip" role="presentation" style={{ left: tipLeft, ...(tipLeft > width / 2 ? { transform: "translateX(-100%)" } : {}) }}>
          <strong>{shortDay(hovered.day)}</strong>
          <span>Turns <b>{hovered.turns}</b></span>
          <span>Spend <b>{costKnown ? formatUsd(hovered.costUsd) : "—"}</b></span>
          <span>Tokens <b>{costKnown ? `${formatCompact(hovered.inputTokens)} → ${formatCompact(hovered.outputTokens)}` : "—"}</b></span>
          {costKnown && cacheShare(hovered) !== null && <span>Cache <b>{cacheShare(hovered)} %</b></span>}
        </div>
      )}
      <table className="sr-only">
        <caption>{LABELS[metric]} per day</caption>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}>
              <th scope="row">{d.day}</th>
              <td>{formatMetric(metricValue(d, metric), metric)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
