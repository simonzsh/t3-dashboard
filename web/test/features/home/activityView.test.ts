import { test } from "bun:test";
import assert from "node:assert/strict";
import type { UsageOverview } from "../../../../shared/api.ts";
import { barLayout, barRange, cacheShare, chartBars, chartTitle, delta, labelEvery, formatMetric, formatUsd, metricValue, niceTicks, shortDay, tokensOf } from "../../../src/features/home/activityView.ts";

const day = (over: Partial<UsageOverview["days"][number]> = {}) => ({ day: "2026-01-10", turns: 0, costUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, ...over });

test("formatUsd shows cents, groups thousands and keeps tiny amounts visible", () => {
  assert.equal(formatUsd(9.634), "$9.63");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(1234.5), "$1,234.50");
  assert.equal(formatUsd(0.004), "<$0.01");
});

test("delta compares two periods as a signed percent", () => {
  assert.equal(delta(63, 49), "+29 %");
  assert.equal(delta(95, 100), "−5 %");
  assert.equal(delta(10, 10), "0 %");
});

test("delta says new when the previous period is empty and nothing when both are", () => {
  assert.equal(delta(5, 0), "new");
  assert.equal(delta(0, 0), null);
  assert.equal(delta(0, 4), "−100 %");
});

test("cacheShare is the cached part of the input, as a whole percent", () => {
  assert.equal(cacheShare({ inputTokens: 200, cachedInputTokens: 150 }), 75);
  assert.equal(cacheShare({ inputTokens: 3, cachedInputTokens: 1 }), 33);
  assert.equal(cacheShare({ inputTokens: 0, cachedInputTokens: 0 }), null);
});

test("a day's tokens are input plus output", () => {
  assert.equal(tokensOf(day({ inputTokens: 100, outputTokens: 30 })), 130);
});

test("each metric reads its own field and formats it", () => {
  const d = day({ turns: 7, costUsd: 1.5, inputTokens: 2000, outputTokens: 500 });
  assert.deepEqual([metricValue(d, "turns"), metricValue(d, "cost"), metricValue(d, "tokens")], [7, 1.5, 2500]);
  assert.deepEqual([formatMetric(7, "turns"), formatMetric(1.5, "cost"), formatMetric(2500, "tokens")], ["7", "$1.50", "2.5k"]);
});

test("niceTicks gives round steps from zero up to the max", () => {
  assert.deepEqual(niceTicks(0), [0, 1]);
  assert.deepEqual(niceTicks(7), [0, 2, 4, 6, 8]);
  assert.deepEqual(niceTicks(63), [0, 20, 40, 60, 80]);
  assert.deepEqual(niceTicks(0.9), [0, 0.25, 0.5, 0.75, 1]);
  assert.ok(niceTicks(1234).at(-1)! >= 1234);
});

test("barLayout puts one bar per value, zero days with no height, the top at the top tick", () => {
  const bars = barLayout([0, 5, 10], 10, 100, 30);
  assert.equal(bars.length, 3);
  assert.equal(bars[0]!.height, 0);
  assert.equal(bars[2]!.height, 100);
  assert.equal(bars[1]!.height, 50);
  assert.equal(bars[1]!.y, 50);
  assert.ok(bars[0]!.x < bars[1]!.x && bars[1]!.x < bars[2]!.x);
});

test("shortDay reads a calendar day without a time zone shift", () => {
  assert.equal(shortDay("2026-01-05"), "Jan 5");
  assert.equal(shortDay("2026-12-31"), "Dec 31");
});

// n days ending 2026-11-06, oldest first; day i holds i + 1 turns and $0.1 x (i + 1).
function series(count: number): UsageOverview["days"] {
  return Array.from({ length: count }, (_, i) => day({ day: new Date(Date.UTC(2026, 10, 6 - (count - 1 - i))).toISOString().slice(0, 10), turns: i + 1, costUsd: 0.1 * (i + 1), inputTokens: 10, cachedInputTokens: 5, outputTokens: 1 }));
}

test("chartBars for 7 days keeps the last 14 days, one bar each", () => {
  const bars = chartBars(series(14), 7);
  assert.equal(bars.length, 14);
  assert.deepEqual([bars[0]!.from, bars[0]!.to, bars[0]!.turns], ["2026-10-24", "2026-10-24", 1]);
  assert.deepEqual([bars[13]!.from, bars[13]!.to, bars[13]!.turns], ["2026-11-06", "2026-11-06", 14]);
});

test("chartBars for 30 days keeps the last 30 of 60 days", () => {
  const bars = chartBars(series(60), 30);
  assert.equal(bars.length, 30);
  assert.equal(bars[0]!.from, "2026-10-08");
  assert.equal(bars[0]!.turns, 31);
  assert.equal(bars.at(-1)!.to, "2026-11-06");
});

test("chartBars for 90 days sums 13 rolling weeks that end today", () => {
  const bars = chartBars(series(180), 90);
  assert.equal(bars.length, 13);
  assert.deepEqual([bars.at(-1)!.from, bars.at(-1)!.to], ["2026-10-31", "2026-11-06"]);
  // The last 7 days hold turns 174 to 180.
  assert.equal(bars.at(-1)!.turns, 174 + 175 + 176 + 177 + 178 + 179 + 180);
  assert.equal(bars.at(-1)!.inputTokens, 70);
  assert.equal(bars.at(-1)!.cachedInputTokens, 35);
  assert.equal(bars.at(-1)!.outputTokens, 7);
  assert.equal(bars[0]!.from, "2026-08-08");
  assert.equal(bars[0]!.turns, 90 + 91 + 92 + 93 + 94 + 95 + 96);
  // 0.1 x (174 + ... + 180) = 123.9, free of float noise.
  assert.equal(bars.at(-1)!.costUsd, 123.9);
});

test("chartBars uses what it gets when the input is short", () => {
  assert.equal(chartBars([], 90).length, 0);
  assert.equal(chartBars(series(3), 7).length, 3);
  const weekly = chartBars(series(10), 90);
  assert.deepEqual(weekly.map((bar) => bar.turns), [1 + 2 + 3, 4 + 5 + 6 + 7 + 8 + 9 + 10]);
  assert.equal(weekly[0]!.from, "2026-10-28");
});

test("chartTitle names what the chart shows", () => {
  assert.deepEqual([7, 30, 90].map((p) => chartTitle(p as 7 | 30 | 90)), ["Last 14 days", "Last 30 days", "Last 13 weeks"]);
});

test("barRange gives one day or a span", () => {
  assert.equal(barRange({ ...chartBars(series(14), 7)[13]! }), "Nov 6");
  assert.equal(barRange(chartBars(series(180), 90).at(-1)!), "Oct 31 – Nov 6");
});

test("labelEvery keeps labels at least 48 px apart", () => {
  assert.equal(labelEvery(65), 1);
  assert.equal(labelEvery(30), 2);
  assert.equal(labelEvery(10), 5);
  assert.equal(labelEvery(0.5), 96);
  assert.equal(labelEvery(1000), 1);
});
