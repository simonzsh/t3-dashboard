import { test } from "bun:test";
import assert from "node:assert/strict";
import { prGroupStatus, prStatus } from "../../src/lib/prStatus.ts";

test("PR states have distinct icons and colors, with final states before draft", () => {
  const states = ["open", "merged", "closed", "draft"];
  const results = states.map(state => prStatus({ state: state === "draft" ? "open" : state, draft: state === "draft" }));
  assert.equal(new Set(results.map(s => s.icon)).size, 4);
  assert.deepEqual(results.map(s => s.className), states.map(s => `pr-status-${s}`));
  assert.equal(prStatus({ state: "merged", draft: true }).label, "Merged");
  assert.equal(prStatus({ state: "closed", draft: true }).label, "Closed");
  assert.equal(prStatus({}).label, "Status unknown");
});

test("group status prioritizes open work and only marks all merged as merged", () => {
  const open = { state: "open" };
  const merged = { state: "merged" };
  const closed = { state: "closed" };
  const draft = { state: "open", draft: true };
  for (const prs of [[open, open], [merged, open], [open, closed], [{}, open], [draft, open]]) {
    assert.deepEqual(prGroupStatus(prs), prStatus(open));
    assert.deepEqual(prGroupStatus([...prs].reverse()), prStatus(open));
  }
  assert.deepEqual(prGroupStatus([merged, merged]), prStatus(merged));
  assert.deepEqual(prGroupStatus([closed, closed]), prStatus(closed));
  assert.deepEqual(prGroupStatus([merged, draft]), prStatus(draft));
  for (const prs of [[merged, closed], [merged, {}]]) {
    assert.equal(prGroupStatus(prs).className, "pr-status-unknown");
    assert.equal(prGroupStatus(prs).label, "Mixed statuses");
  }
  assert.equal(prGroupStatus([]).label, "Status unknown");
});
