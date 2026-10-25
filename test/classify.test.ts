import assert from "node:assert/strict";
import { test } from "bun:test";
import { DONE_WINDOW_DAYS, bucketOf, isHidden, toDashboardThread } from "../src/classify.ts";
import type { RawThread } from "../src/t3/types.ts";

const now = new Date("2026-03-20T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
const thread = (extra: Partial<RawThread> = {}): RawThread => ({ id: "thread-1", projectId: "project-1", status: "idle", createdAt: ago(100 * DAY), ...extra });

test("DONE_WINDOW_DAYS is 7", () => assert.equal(DONE_WINDOW_DAYS, 7));

const buckets: Array<[string, Partial<RawThread>, string]> = [
  ["pending request", { pendingRuntimeRequest: { id: "r", kind: "command" } }, "todo"],
  ["pending beats running", { status: "running", pendingRuntimeRequest: { id: "r", kind: "command" } }, "todo"],
  ["pending beats snooze", { snoozedUntil: ago(-DAY), pendingRuntimeRequest: { id: "r", kind: "user_input" } }, "todo"],
  ["running", { status: "running" }, "running"],
  ["queued", { status: "queued" }, "running"],
  ["waiting", { status: "waiting" }, "running"],
  ["preparing", { status: "preparing" }, "running"],
  ["starting", { status: "starting" }, "running"],
  ["running beats snooze", { status: "running", snoozedUntil: ago(-DAY) }, "running"],
  ["snoozed failed thread", { status: "failed", snoozedUntil: ago(-DAY) }, "inactive"],
  ["snooze in the past is ignored", { status: "failed", snoozedUntil: ago(DAY) }, "todo"],
  ["settled override", { status: "failed", settledOverride: "settled" }, "inactive"],
  ["settledAt", { status: "failed", settledAt: ago(DAY) }, "inactive"],
  ["settledAt with active override", { status: "failed", settledAt: ago(DAY), settledOverride: "active" }, "todo"],
  ["actionable plan", { hasActionableProposedPlan: true }, "todo"],
  ["settled beats plan", { hasActionableProposedPlan: true, settledOverride: "settled" }, "inactive"],
  ["failed", { status: "failed" }, "todo"],
  ["interrupted with error", { status: "interrupted", lastError: "boom", latestRunCompletedAt: ago(30 * DAY) }, "todo"],
  ["interrupted without error, recent", { status: "interrupted", latestRunCompletedAt: ago(DAY) }, "done"],
  ["completed recent", { status: "completed", latestRunCompletedAt: ago(DAY) }, "done"],
  ["completed at the 7-day edge", { status: "completed", latestRunCompletedAt: ago(7 * DAY) }, "done"],
  ["completed just over the edge", { status: "completed", latestRunCompletedAt: ago(7 * DAY + 1) }, "inactive"],
  ["rolled_back recent", { status: "rolled_back", latestRunCompletedAt: ago(DAY) }, "done"],
  ["idle", { status: "idle" }, "inactive"],
  ["cancelled", { status: "cancelled", latestRunCompletedAt: ago(DAY) }, "inactive"],
  ["unknown status", { status: "weird" }, "inactive"],
  ["subagents still running after the turn", { status: "completed", latestRunCompletedAt: ago(DAY), pendingBackgroundTasks: [{ taskId: "t1", kind: "subagent" }] }, "running"],
  ["blocked on a thread wait", { status: "completed", latestRunCompletedAt: ago(DAY), blockedOnThreadWait: true }, "running"],
  ["background work beats settled", { status: "completed", settledAt: ago(DAY), pendingBackgroundTasks: [{ taskId: "t1" }] }, "running"],
  ["pending beats background work", { pendingRuntimeRequest: { id: "r", kind: "command" }, pendingBackgroundTasks: [{ taskId: "t1" }] }, "todo"],
  ["no background task left", { status: "completed", latestRunCompletedAt: ago(DAY), pendingBackgroundTasks: [], blockedOnThreadWait: false }, "done"],
];
for (const [name, extra, expected] of buckets) {
  test(`bucket: ${name} -> ${expected}`, () => assert.equal(bucketOf(thread(extra), now), expected));
}

test("a pin or a visit (updatedAt) does not reopen an old completed thread", () => {
  const raw = thread({ status: "completed", latestRunCompletedAt: ago(30 * DAY), updatedAt: ago(1000) });
  assert.equal(bucketOf(raw, now), "inactive");
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
    assert.deepEqual(category(kind), { requestId: "req-1", kind, category: "approval" });
  }
  assert.deepEqual(category("user_input"), { requestId: "req-1", kind: "user_input", category: "user-input" });
  assert.deepEqual(category("auth_refresh"), { requestId: "req-1", kind: "auth_refresh", category: "other" });
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
      branch: "feature/x",
      linkedPullRequest: { url: "https://example.test/pr/1" },
      pullRequests: [{ url: "https://example.test/pr/2" }],
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
  assert.equal(full.branch, "feature/x");
  assert.equal(full.pullRequestUrl, "https://example.test/pr/1");
  assert.equal(full.updatedAt, ago(1000));

  const bare = toDashboardThread({ id: "thread-2" }, now);
  assert.equal(bare.title, "");
  assert.equal(bare.provider, "");
  assert.equal(bare.model, null);
  assert.equal(bare.pinned, false);
  assert.equal(bare.pullRequestUrl, null);
  assert.equal(bare.hasActionableProposedPlan, false);
  assert.equal(bare.projectId, "");
  assert.equal(bare.backgroundWork, false);
  assert.equal(toDashboardThread(thread({ status: "completed", pendingBackgroundTasks: [{ taskId: "t1" }] }), now).backgroundWork, true);
  assert.equal(toDashboardThread(thread({ blockedOnThreadWait: true }), now).backgroundWork, true);

  const viaSelection = toDashboardThread(thread({ modelSelection: { instanceId: "provider-b", model: "model-x" } }), now);
  assert.equal(viaSelection.provider, "provider-b");
  const viaList = toDashboardThread(thread({ pullRequests: [{ url: "https://example.test/pr/2" }] }), now);
  assert.equal(viaList.pullRequestUrl, "https://example.test/pr/2");
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
