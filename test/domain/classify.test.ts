import assert from "node:assert/strict";
import { test } from "bun:test";
import { isHidden, isSettled, toDashboardThread } from "../../src/domain/classify.ts";
import type { RawThread } from "../../src/integrations/t3/schemas.ts";

const now = new Date("2026-03-20T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const thread = (extra: Partial<RawThread> = {}): RawThread => ({ id: "thread-1", projectId: "project-1", status: "idle", createdAt: ago(100 * DAY), ...extra });

test("a pin or a visit (updatedAt) does not count as activity", () => {
  const raw = thread({ status: "completed", latestRunCompletedAt: ago(30 * DAY), updatedAt: ago(1000) });
  assert.equal(toDashboardThread(raw, now).lastActivityAt, ago(30 * DAY));
});

test("lastActivityAt is the maximum of the activity fields", () => {
  const raw = thread({
    latestVisibleMessage: { role: "assistant", text: "x", updatedAt: ago(5 * DAY) },
    latestRunCompletedAt: ago(4 * DAY),
    activityRunStartedAt: ago(3 * DAY),
    latestRunStartedAt: ago(6 * DAY),
    latestUserMessageAt: ago(2 * DAY),
  });
  assert.equal(toDashboardThread(raw, now).lastActivityAt, ago(2 * DAY));
});

test("pending category", () => {
  const category = (kind: string) => toDashboardThread(thread({ pendingRuntimeRequest: { id: "req-1", kind } }), now).pending;
  for (const kind of ["command", "file-read", "file-change", "permission", "mcp-elicitation"]) {
    assert.deepEqual(category(kind), { category: "approval" });
  }
  assert.deepEqual(category("user_input"), { category: "user-input" });
  assert.deepEqual(category("auth_refresh"), { category: "other" });
  assert.equal(toDashboardThread(thread(), now).pending, null);
});

test("field mapping with fallbacks", () => {
  const full = toDashboardThread(
    thread({
      title: "Thread 1",
      providerInstanceId: "provider-a",
      modelSelection: { instanceId: "provider-b", model: "model-x" },
      status: "running",
      activeRunId: "run-1",
      lastError: "oops",
      pinnedAt: ago(DAY),
      updatedAt: ago(1000),
    }),
    now,
  );
  assert.equal(full.title, "Thread 1");
  assert.equal(full.provider, "provider-a");
  assert.equal(full.model, "model-x");
  assert.equal(full.activeRunId, "run-1");
  assert.equal(full.lastError, "oops");
  assert.equal(full.pinned, true);

  const bare = toDashboardThread({ id: "thread-2" }, now);
  assert.equal(bare.title, "");
  assert.equal(bare.provider, "");
  assert.equal(bare.model, null);
  assert.equal(bare.pinned, false);
  assert.equal(bare.projectId, "");
  assert.equal(bare.backgroundWork, false);
  assert.equal(toDashboardThread(thread({ status: "completed", pendingBackgroundTasks: [{ taskId: "t1" }] }), now).backgroundWork, true);
  assert.equal(toDashboardThread(thread({ blockedOnThreadWait: true }), now).backgroundWork, true);
  assert.equal(toDashboardThread(thread({ blockedOnThreadWait: true }), now).pendingTasks, false);
  assert.equal(toDashboardThread(thread({ pendingBackgroundTasks: [{ taskId: "t1" }] }), now).pendingTasks, true);

  const viaSelection = toDashboardThread(thread({ modelSelection: { instanceId: "provider-b", model: "model-x" } }), now);
  assert.equal(viaSelection.provider, "provider-b");
});

test("isHidden", () => {
  assert.equal(isHidden(thread()), false);
  assert.equal(isHidden(thread({ lineage: { relationshipToParent: "subagent" }, creationSource: "provider" })), true);
  assert.equal(isHidden(thread({ lineage: { relationshipToParent: "subagent" }, creationSource: "web" })), false);
  assert.equal(isHidden(thread({ lineage: { relationshipToParent: "fork" }, creationSource: "provider" })), false);
  assert.equal(isHidden(thread({ deletedAt: ago(DAY) })), true);
  assert.equal(isHidden(thread({ archivedAt: ago(DAY) })), true);
  assert.equal(isHidden(thread(), "archive"), true);
  assert.equal(isHidden(thread(), "active"), false);
});

// Mirrors the T3 Code sidebar: the override decides, and an active snooze shows first.
test("isSettled follows the settled override like the T3 Code sidebar", () => {
  assert.equal(isSettled(thread(), now), false);
  assert.equal(isSettled(thread({ settledOverride: "settled", settledAt: ago(DAY) }), now), true);
  assert.equal(isSettled(thread({ settledOverride: "settled" }), now), true);
  assert.equal(isSettled(thread({ settledOverride: "active", unsettledAt: ago(DAY) }), now), false);
  assert.equal(isSettled(thread({ settledOverride: null, settledAt: ago(DAY) }), now), false);
});

test("isSettled: a snoozed thread is not in the settled section until it wakes", () => {
  assert.equal(isSettled(thread({ settledOverride: "settled", snoozedUntil: ago(-DAY) }), now), false);
  assert.equal(isSettled(thread({ settledOverride: "settled", snoozedUntil: ago(DAY) }), now), true);
  assert.equal(isSettled(thread({ settledOverride: "settled", snoozedUntil: ago(-DAY), pendingRuntimeRequest: { id: "r", kind: "command" } }), now), true);
});

test("toDashboardThread carries the settled state", () => {
  assert.equal(toDashboardThread(thread({ settledOverride: "settled" }), now).settled, true);
  assert.equal(toDashboardThread(thread(), now).settled, false);
});

const pr = (number: number, extra: object = {}) => ({ host: "example.test", repository: "acme/storefront", number, url: `https://example.test/acme/storefront/pull/${number}`, ...extra });
const link = (number: number, extra: object = {}) => pr(number, { source: "manual", linkedAt: "2026-11-01T00:00:00.000Z", snapshot: null, stack: null, ...extra });
const prsOf = (extra: Partial<RawThread>) => toDashboardThread(thread({ branch: "cart", ...extra }), now).pullRequests;
const numbers = (extra: Partial<RawThread>) => prsOf(extra).map((p) => p.number);

test("the pull requests come from T3's list in its order, with the branch one last", () => {
  assert.deepEqual(numbers({ pullRequests: [link(12), link(14)], branchPullRequest: pr(9) }), [12, 14, 9]);
  assert.deepEqual(prsOf({ pullRequests: [link(12, { snapshot: { title: "Cart", state: "open" } })] }), [{ repository: "acme/storefront", number: 12, url: "https://example.test/acme/storefront/pull/12", title: "Cart", state: "open", draft: false }]);
  assert.equal(toDashboardThread(thread({ branch: "cart" }), now).branch, "cart");
  assert.equal(toDashboardThread(thread(), now).branch, null);
});

test("like T3, the list wins over the legacy linked pull request, which only counts when there is no list", () => {
  assert.deepEqual(numbers({ linkedPullRequest: pr(12), branchPullRequest: pr(9) }), [12, 9]);
  assert.deepEqual(numbers({ pullRequests: [link(14)], linkedPullRequest: pr(12) }), [14]);
  // An empty list is still a list: T3 shows no pull request then, the legacy field included.
  assert.deepEqual(numbers({ pullRequests: [], linkedPullRequest: pr(12) }), []);
  assert.deepEqual(numbers({}), []);
});

test("dismissed stack layers are hidden, and a pull request shows once (repository case ignored)", () => {
  assert.deepEqual(numbers({ pullRequests: [link(12), link(13, { source: "stack-dismissed" })] }), [12]);
  assert.deepEqual(numbers({ pullRequests: [link(12), link(12, { repository: "Acme/Storefront" })], branchPullRequest: pr(12) }), [12]);
});

test("a pull request that cannot make a safe link is dropped, the others stay", () => {
  for (const bad of [{ repository: "--repo=x/y" }, { number: null }, { number: 0 }, { number: 1.5 }, { url: null }, { repository: null }]) {
    assert.deepEqual(numbers({ pullRequests: [link(1, bad), link(2)] }), [2], JSON.stringify(bad));
    assert.deepEqual(numbers({ linkedPullRequest: pr(1, bad) }), [], JSON.stringify(bad));
  }
});

test("settlement time reaches the dashboard independently of activity", () => {
  const mapped = toDashboardThread(thread({ settledOverride: "settled", settledAt: ago(1000) }), now);
  assert.equal(mapped.settledAt, ago(1000));
  assert.equal(mapped.lastActivityAt, ago(100 * DAY));
  assert.equal(toDashboardThread(thread(), now).settledAt, null);
});
