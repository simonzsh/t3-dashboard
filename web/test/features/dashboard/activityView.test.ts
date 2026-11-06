import { test } from "bun:test";
import assert from "node:assert/strict";
import type { UsageOverview } from "../../../../shared/api.ts";
import { barLayout, cacheShare, delta, formatMetric, formatUsd, metricValue, niceTicks, shortDay, tokensOf } from "../../../src/features/dashboard/activityView.ts";

const day = (over: Partial<UsageOverview["days"][number]> = {}) => ({ day: "2026-01-10", turns: 0, costUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, ...over });

test("formatUsd shows cents, groups thousands and keeps tiny amounts visible", () => {
  assert.equal(formatUsd(9.634), "$9.63");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(1234.5), "$1,234.50");
  assert.equal(formatUsd(0.004), "<$0.01");
});

test("delta compares two weeks as a signed percent", () => {
  assert.equal(delta(63, 49), "+29 %");
  assert.equal(delta(95, 100), "−5 %");
  assert.equal(delta(10, 10), "0 %");
});

test("delta says new when last week is empty and nothing when both are", () => {
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
