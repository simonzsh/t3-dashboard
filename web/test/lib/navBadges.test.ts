import { test } from "bun:test";
import assert from "node:assert/strict";
import { agentCounts, badgeText, navBadges } from "../../src/lib/navBadges.ts";
import { thread } from "../fixtures.ts";

const ask = { category: "approval" as const };

test("agentCounts counts waiting and working threads", () => {
  const counts = agentCounts([thread("a", { pending: ask }), thread("b", { status: "running" }), thread("c", { activeRunId: "r" }), thread("d", { status: "completed" }), thread("e")]);
  assert.deepEqual(counts, { waiting: 1, running: 2 });
});

test("navBadges counts every running agent, open as a column or not", () => {
  const threads = [thread("a", { status: "running" }), thread("b", { status: "running" }), thread("c", { status: "completed" })];
  assert.deepEqual(navBadges(threads), { sessionsRunning: 2, sessionsWaiting: false });
});

test("navBadges flags an agent that waits for an answer", () => {
  assert.equal(navBadges([thread("a", { pending: ask })]).sessionsWaiting, true);
  assert.equal(navBadges([thread("a")]).sessionsWaiting, false);
});

test("the badge caps at 9+", () => {
  assert.equal(badgeText(3), "3");
  assert.equal(badgeText(9), "9");
  assert.equal(badgeText(10), "9+");
});
