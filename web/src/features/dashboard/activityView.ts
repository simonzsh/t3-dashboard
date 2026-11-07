import { formatTokens, MONTHS } from "../../lib/format.ts";
import type { ActivityPeriod, UsageDay, UsageTotals } from "../../../../shared/api.ts";

export type Metric = "turns" | "cost" | "tokens";

export const METRICS: ReadonlyArray<{ id: Metric; label: string }> = [
  { id: "turns", label: "Turns" },
  { id: "cost", label: "Spend" },
  { id: "tokens", label: "Tokens" },
];

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "<$0.01";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "+29 %", "−5 %", "new" when the previous period was empty, null when both are. */
export function delta(current: number, previous: number): string | null {
  if (previous === 0) return current > 0 ? "new" : null;
  const percent = Math.round(((current - previous) / previous) * 100);
  if (percent === 0) return "0 %";
  return `${percent > 0 ? "+" : "−"}${Math.abs(percent)} %`;
}

/** The cached part of the input, in whole percent; null without input. */
export function cacheShare(totals: Pick<UsageTotals, "inputTokens" | "cachedInputTokens">): number | null {
  return totals.inputTokens > 0 ? Math.round((totals.cachedInputTokens / totals.inputTokens) * 100) : null;
}

export const tokensOf = (d: Pick<UsageTotals, "inputTokens" | "outputTokens">): number => d.inputTokens + d.outputTokens;

export function metricValue(d: UsageTotals, metric: Metric): number {
  if (metric === "turns") return d.turns;
  return metric === "cost" ? d.costUsd : tokensOf(d);
}

export function formatMetric(value: number, metric: Metric): string {
  if (metric === "turns") return String(value);
  return metric === "cost" ? formatUsd(value) : formatTokens(value);
}

/** Round tick values from 0 up to the first one at or above `max`. */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10;
  const count = Math.ceil(max / step - 1e-9);
  return Array.from({ length: count + 1 }, (_, i) => Number((i * step).toPrecision(12)));
}

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One bar per value in a `width` x `height` plot; `top` is the value at the top edge. */
export function barLayout(values: number[], top: number, height: number, width: number): Bar[] {
  const slot = width / values.length;
  const barWidth = Math.min(28, slot * 0.6);
  return values.map((value, i) => {
    const h = top > 0 ? (value / top) * height : 0;
    return { x: i * slot + (slot - barWidth) / 2, y: height - h, width: barWidth, height: h };
  });
}

/** "2026-01-05" -> "Jan 5", read as text so no time zone moves the day. */
export function shortDay(day: string): string {
  const [, month, date] = day.split("-").map(Number);
  return `${MONTHS[month! - 1]} ${date}`;
}

/** One bar of the chart: a day, or 7 days for the longest period. `from` and `to` are inclusive. */
export interface ChartBar extends UsageTotals {
  from: string;
  to: string;
}

const DAYS_PER_BAR = { 7: 1, 30: 1, 90: 7 } as const;
const BARS = { 7: 14, 30: 30, 90: 13 } as const;

function addTotals(days: UsageDay[]): ChartBar {
  const total = { turns: 0, costUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  for (const day of days) {
    total.turns += day.turns;
    total.costUsd += day.costUsd;
    total.inputTokens += day.inputTokens;
    total.cachedInputTokens += day.cachedInputTokens;
    total.outputTokens += day.outputTokens;
  }
  // Sums of floats: keep the cents, drop the noise.
  return { ...total, costUsd: Math.round(total.costUsd * 100) / 100, from: days[0]!.day, to: days.at(-1)!.day };
}

/** The bars of the chart, oldest first; the last one ends today. Groups are counted from the end. */
export function chartBars(days: UsageDay[], period: ActivityPeriod): ChartBar[] {
  const size = DAYS_PER_BAR[period];
  const shown = days.slice(-BARS[period] * size);
  const bars: ChartBar[] = [];
  for (let end = shown.length; end > 0; end -= size) bars.unshift(addTotals(shown.slice(Math.max(0, end - size), end)));
  return bars;
}

export function chartTitle(period: ActivityPeriod): string {
  return period === 90 ? `Last ${BARS[90]} weeks` : `Last ${BARS[period]} days`;
}

/** "Nov 6" for one day, "Oct 31 – Nov 6" for a span. */
export function barRange({ from, to }: Pick<ChartBar, "from" | "to">): string {
  return from === to ? shortDay(from) : `${shortDay(from)} – ${shortDay(to)}`;
}

/** Label every n-th bar so two labels stay at least 48 px apart. */
export const labelEvery = (slot: number): number => Math.max(1, Math.ceil(48 / slot));
