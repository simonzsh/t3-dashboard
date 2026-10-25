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

test("preview is cut to 280 characters with an ellipsis", () => {
  const preview = (text: string) => toDashboardThread(thread({ latestVisibleMessage: { role: "user", text } }), now).preview;
  assert.deepEqual(preview("a".repeat(280)), { role: "user", text: "a".repeat(280) });
  assert.deepEqual(preview("a".repeat(281)), { role: "user", text: `${"a".repeat(280)}…` });
  assert.equal(toDashboardThread(thread(), now).preview, null);
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
  assert.equal(full.activeRunId, "run-1");
  assert.equal(full.lastError, "oops");
  assert.equal(full.pinned, true);

  const bare = toDashboardThread({ id: "thread-2" }, now);
  assert.equal(bare.title, "");
  assert.equal(bare.provider, "");
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
