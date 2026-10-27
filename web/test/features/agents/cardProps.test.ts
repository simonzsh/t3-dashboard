import { test } from "bun:test";
import assert from "node:assert/strict";
import { sameCardProps } from "../../../src/features/agents/cardProps.ts";
import { thread } from "../../fixtures.ts";

const noop = () => {};
const settle = async () => {};
const now = new Date(0);
const props = (over: Record<string, unknown> = {}) => ({
  card: { thread: thread("a"), status: "idle" as const },
  now,
  onDesk: false,
  t3EnvironmentId: null,
  onOpen: noop,
  onToggleDesk: noop,
  onSettle: settle,
  ...over,
});

test("a new card object with the same thread and status is equal", () => {
  const a = props();
  const b = props({ card: { ...a.card } });
  assert.equal(sameCardProps(a, b), true);
});

test("a new thread object, a new status or any other changed prop is not equal", () => {
  const a = props();
  assert.equal(sameCardProps(a, props({ card: { thread: { ...a.card.thread }, status: "idle" } })), false);
  assert.equal(sameCardProps(a, props({ card: { thread: a.card.thread, status: "working" } })), false);
  assert.equal(sameCardProps(a, props({ card: a.card, onDesk: true })), false);
  assert.equal(sameCardProps(a, props({ card: a.card, now: new Date(1) })), false);
  assert.equal(sameCardProps(a, props({ card: a.card, onOpen: () => {} })), false);
});
