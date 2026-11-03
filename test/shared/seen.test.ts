import assert from "node:assert/strict";
import { test } from "bun:test";
import { joinSeen, mergeSeen, normalizeSeen, prune, SEEN_CAP, type SeenState } from "../../shared/seen.ts";

const at = (minute: number) => `2026-01-10T10:${String(minute).padStart(2, "0")}:00.000Z`;
const base: SeenState = { since: at(5), seen: {} };

test("a mark only moves forward", () => {
  const first = mergeSeen(base, { id: "a", at: at(20) })!;
  assert.deepEqual(first.seen, { a: at(20) });
  assert.equal(mergeSeen(first, { id: "a", at: at(10) }), first);
  assert.equal(mergeSeen(first, { id: "a", at: at(20) }), first);
  assert.deepEqual(mergeSeen(first, { id: "a", at: at(30) })!.seen, { a: at(30) });
});

test("a mark at or before the baseline changes nothing", () => {
  assert.equal(mergeSeen(base, { id: "a", at: at(5) }), base);
  assert.equal(mergeSeen(base, { id: "a", at: at(1) }), base);
});

test("the baseline is set once and a mark needs a baseline", () => {
  assert.deepEqual(mergeSeen(null, { since: at(7) }), { since: at(7), seen: {} });
  assert.equal(mergeSeen(base, { since: at(50) }), base);
  assert.equal(mergeSeen(null, { id: "a", at: at(9) }), null);
});

test("merging the same changes in any order gives the same state", () => {
  const changes = [{ id: "a", at: at(20) }, { id: "b", at: at(12) }, { id: "a", at: at(8) }];
  const run = (list: typeof changes) => list.reduce<SeenState | null>((s, c) => mergeSeen(s, c), base);
  assert.deepEqual(run(changes), run([...changes].reverse()));
});

test("prune keeps the newest marks; dropped ones move the baseline up so they stay seen", () => {
  const seen: Record<string, string> = { stale: at(1) };
  for (let i = 0; i < SEEN_CAP + 50; i++) seen[`t${i}`] = new Date(Date.UTC(2026, 0, 11, 0, 0, i)).toISOString();
  const out = prune({ since: at(5), seen });
  const ids = Object.keys(out.seen);
  assert.equal(ids.length, SEEN_CAP);
  assert.ok(!ids.includes("stale") && !ids.includes("t0") && ids.includes(`t${SEEN_CAP + 49}`));
  assert.equal(out.since, seen.t49);
});

test("normalizeSeen keeps bounded strings and refuses what is not a state", () => {
  assert.deepEqual(normalizeSeen({ since: at(5), seen: { a: at(9), b: 3, ["x".repeat(201)]: at(9), c: "y".repeat(65), d: at(2), e: "~" } }), { since: at(5), seen: { a: at(9) } });
  assert.deepEqual(normalizeSeen({ since: at(5) }), { since: at(5), seen: {} });
  for (const bad of [null, 42, "x", [], {}, { since: "" }, { since: 3 }, { since: "x".repeat(65) }, { since: "~" }, { since: "2026-99-99T00:00:00Z" }]) assert.equal(normalizeSeen(bad), null, JSON.stringify(bad));
});

test("joinSeen folds a server state into the local one without losing a mark", () => {
  const local: SeenState = { since: at(5), seen: { a: at(20), b: at(10) } };
  const remote: SeenState = { since: at(6), seen: { b: at(15), c: at(12) } };
  assert.deepEqual(joinSeen(local, remote), { since: at(6), seen: { a: at(20), b: at(15), c: at(12) } });
  assert.equal(joinSeen(null, remote), remote);
});
