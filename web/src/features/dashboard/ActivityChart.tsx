import { useEffect, useRef, useState } from "react";
import { formatTokens } from "../../lib/format.ts";
import { barLayout, barRange, cacheShare, formatMetric, formatUsd, labelEvery, METRICS, metricValue, niceTicks, shortDay, tokensOf, type ChartBar, type Metric } from "./activityView.ts";

const MARGIN = { top: 10, right: 20, bottom: 24, left: 52 };
// A lower chart on a phone (under 480 px wide).
const heightFor = (width: number) => (width < 480 ? 140 : 190);
const START_WIDTH = 640;

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

function describe(bar: ChartBar, costKnown: boolean): string {
  const cost = costKnown ? formatUsd(bar.costUsd) : "no cost data";
  return `${barRange(bar)}: ${bar.turns} turns, ${cost}, ${formatTokens(tokensOf(bar))} tokens`;
}

interface Props {
  bars: ChartBar[];
  /** Each bar holds 7 days. */
  weekly: boolean;
  metric: Metric;
  /** False when T3 sent no usage: cost and tokens are then not real zeros. */
  costKnown: boolean;
}

/** One series of bars, a day or a week each. The values also sit in a table for screen readers. */
export function ActivityChart({ bars: data, weekly, metric, costKnown }: Props) {
  const [ref, width] = useWidth();
  const label = METRICS.find((m) => m.id === metric)!.label;
  const [active, setActive] = useState<number | null>(null);
  const height = heightFor(width);
  const plotHeight = height - MARGIN.top - MARGIN.bottom;
  const plotWidth = width - MARGIN.left - MARGIN.right;
  const unit = weekly ? "week" : "day";
  const values = data.map((bar) => metricValue(bar, metric));
  const ticks = niceTicks(Math.max(...values, 0));
  const top = ticks.at(-1)!;
  const bars = barLayout(values, top, plotHeight, plotWidth);
  const slot = plotWidth / data.length;
  // Labels keep their distance, and the last bar always has one.
  const every = labelEvery(slot);
  const hovered = active === null ? null : data[active]!;
  const tipLeft = active === null ? 0 : MARGIN.left + (active + 0.5) * slot;

  return (
    <div className="activity-chart" ref={ref} onMouseLeave={() => setActive(null)}>
      <svg width={width} height={height} role="group" aria-label={`${label} per ${unit}, last ${data.length} ${unit}s`}>
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {ticks.map((tick) => {
            const y = plotHeight - (tick / top) * plotHeight;
            return (
              <g key={tick}>
                <line className="activity-grid" x1={0} x2={plotWidth} y1={y} y2={y} />
                <text className="activity-axis" x={-8} y={y} textAnchor="end" dominantBaseline="middle">{formatMetric(tick, metric)}</text>
              </g>
            );
          })}
          {active !== null && <rect className="activity-hover" x={active * slot} y={0} width={slot} height={plotHeight} />}
          {bars.map((bar, i) => {
            const today = i === data.length - 1;
            return (
              <g key={data[i]!.from}>
                {bar.height > 0 ? (
                  <path className={`activity-bar${today ? " today" : ""}`} d={barPath(bar.x, bar.y, bar.width, bar.height)} />
                ) : (
                  <rect className="activity-zero" x={bar.x} y={plotHeight - 2} width={bar.width} height={2} rx={1} />
                )}
                {(data.length - 1 - i) % every === 0 && (
                  <text className={`activity-axis${today ? " today" : ""}`} x={i * slot + slot / 2} y={plotHeight + 16} textAnchor="middle">
                    {today && !weekly ? "Today" : shortDay(data[i]!.from)}
                  </text>
                )}
                <rect
                  className="activity-hit"
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={plotHeight}
                  tabIndex={0}
                  role="img"
                  aria-label={describe(data[i]!, costKnown)}
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
        <div className="activity-tip" role="presentation" style={{ left: tipLeft, ...(tipLeft > width / 2 ? { transform: "translateX(-100%)" } : {}) }}>
          <strong>{barRange(hovered)}</strong>
          <span>Turns <b>{hovered.turns}</b></span>
          <span>Spend <b>{costKnown ? formatUsd(hovered.costUsd) : "—"}</b></span>
          <span>Tokens <b>{costKnown ? `${formatTokens(hovered.inputTokens)} → ${formatTokens(hovered.outputTokens)}` : "—"}</b></span>
          {costKnown && cacheShare(hovered) !== null && <span>Cache <b>{cacheShare(hovered)} %</b></span>}
        </div>
      )}
      <table className="sr-only">
        <caption>{label} per {unit}</caption>
        <tbody>
          {data.map((bar) => (
            <tr key={bar.from}>
              <th scope="row">{barRange(bar)}</th>
              <td>{formatMetric(metricValue(bar, metric), metric)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
