import { test } from "bun:test";
import assert from "node:assert/strict";
import type { BoardResult, LinearInboxItem, LinearIssue } from "../../../../shared/api.ts";
import { FEED_LIMIT, daysUntilDue, glance, linearCardShown, linkedIdentifiers } from "../../../src/features/dashboard/glance.ts";
import { thread } from "../../fixtures.ts";

// Local noon, so the local day is the same in every time zone.
const NOW = new Date(2026, 10, 6, 12, 0, 0);
const day = (offset: number) => {
  const d = new Date(2026, 10, 6 + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function issue(identifier: string, over: Partial<LinearIssue> = {}): LinearIssue {
  return {
    id: `id-${identifier}`,
    identifier,
    title: `Issue ${identifier}`,
    url: `https://linear.example.invalid/${identifier}`,
    state: { name: "Todo", type: "unstarted", color: "#fff" },
    priority: 3,
    priorityLabel: "Medium",
    project: null,
    team: { key: "ABC", name: "Team" },
    updatedAt: "2026-11-01T10:00:00.000Z",
    dueDate: null,
    ...over,
  };
}
function inboxItem(n: number, kind: LinearInboxItem["kind"], over: Partial<LinearInboxItem> = {}): LinearInboxItem {
  const identifier = `IN-${n}`;
  return {
    id: `n${n}`,
    kind,
    createdAt: `2026-11-06T0${n}:00:00.000Z`,
    actor: "Robin",
    url: `https://linear.example.invalid/${identifier}`,
    issue: { id: `id-${identifier}`, identifier, title: `Issue ${identifier}`, url: `https://linear.example.invalid/${identifier}`, priority: 3 },
    ...over,
  };
}
const board = (over: Partial<BoardResult> = {}): BoardResult => ({ configured: true, ok: true, error: null, issues: [], readAt: "2026-11-06T11:00:00.000Z", inbox: [], inboxError: null, ...over });

test("counts: urgent, assigned, mentions (both kinds), due and overdue", () => {
  const out = glance(
    board({
      issues: [issue("A-1", { priority: 1 }), issue("A-2", { priority: 1, dueDate: day(-1) }), issue("A-3", { dueDate: day(2) }), issue("A-4", { dueDate: day(3) }), issue("A-5")],
      inbox: [inboxItem(1, "mention"), inboxItem(2, "comment-mention"), inboxItem(3, "assigned")],
    }),
    NOW,
  );
  assert.deepEqual(out.counts, { urgent: 2, assigned: 1, mentions: 2, due: 2, overdue: 1 });
});

test("an unavailable inbox gives null inbox counts and keeps the issue counts", () => {
  const out = glance(board({ issues: [issue("A-1", { priority: 1 })], inboxError: "boom" }), NOW);
  assert.deepEqual(out.counts, { urgent: 1, assigned: null, mentions: null, due: 0, overdue: 0 });
});

test("overdue is before today, due soon runs from today to two days ahead", () => {
  const issues = [issue("Y", { dueDate: day(-1) }), issue("T", { dueDate: day(0) }), issue("P2", { dueDate: day(2) }), issue("P3", { dueDate: day(3) })];
  const out = glance(board({ issues }), NOW);
  assert.equal(out.counts.overdue, 1);
  assert.equal(out.counts.due, 3);
  assert.deepEqual(out.feed.map((s) => [s.identifier, s.kind]), [["Y", "overdue"], ["T", "due-soon"], ["P2", "due-soon"]]);
});

test("the local day decides at the day boundary", () => {
  const lateEvening = new Date(2026, 10, 6, 23, 59, 0);
  const early = new Date(2026, 10, 6, 0, 1, 0);
  const issues = [issue("T", { dueDate: day(0) })];
  assert.equal(glance(board({ issues }), lateEvening).counts.overdue, 0);
  assert.equal(glance(board({ issues }), early).counts.overdue, 0);
  assert.equal(glance(board({ issues: [issue("Y", { dueDate: day(-1) })] }), early).counts.overdue, 1);
});

test("the feed lists the inbox newest first, then overdue, urgent, then due soon", () => {
  const out = glance(
    board({
      issues: [
        issue("D-1", { dueDate: day(1) }),
        issue("D-2", { dueDate: day(0), priority: 1, updatedAt: "2026-11-02T00:00:00.000Z" }),
        issue("U-1", { priority: 1, updatedAt: "2026-11-03T00:00:00.000Z" }),
        issue("U-2", { priority: 1, updatedAt: "2026-11-04T00:00:00.000Z" }),
        issue("O-1", { dueDate: day(-1) }),
        issue("O-2", { dueDate: day(-5) }),
      ],
      inbox: [inboxItem(3, "assigned"), inboxItem(2, "comment-mention"), inboxItem(1, "mention")],
    }),
    NOW,
  );
  assert.deepEqual(out.feed.map((s) => s.identifier).slice(0, FEED_LIMIT), ["IN-3", "IN-2", "IN-1", "O-2", "O-1"]);
  const all = glance(board({ issues: [issue("D-1", { dueDate: day(1) }), issue("U-1", { priority: 1, updatedAt: "2026-11-03T00:00:00.000Z" }), issue("U-2", { priority: 1, updatedAt: "2026-11-04T00:00:00.000Z" })] }), NOW);
  assert.deepEqual(all.feed.map((s) => [s.identifier, s.kind]), [["U-2", "urgent"], ["U-1", "urgent"], ["D-1", "due-soon"]]);
});

test("due soon rows run nearest first", () => {
  const out = glance(board({ issues: [issue("B", { dueDate: day(2) }), issue("A", { dueDate: day(0) }), issue("C", { dueDate: day(1) })] }), NOW);
  assert.deepEqual(out.feed.map((s) => s.identifier), ["A", "C", "B"]);
});

test("an issue shows once: the first signal wins", () => {
  const shared = issue("S-1", { priority: 1, dueDate: day(-2) });
  const out = glance(board({ issues: [shared], inbox: [inboxItem(1, "mention", { issue: { id: shared.id, identifier: "S-1", title: shared.title, url: shared.url, priority: 1 } })] }), NOW);
  assert.deepEqual(out.feed.map((s) => [s.identifier, s.kind]), [["S-1", "mention"]]);
  assert.equal(out.counts.urgent, 1);
  assert.equal(out.counts.overdue, 1);
});

test("an inbox row carries the actor, the link and the notification date", () => {
  const item = inboxItem(2, "comment-mention", { url: "https://linear.example.invalid/IN-2#comment-9", actor: null });
  const [row] = glance(board({ inbox: [item] }), NOW).feed;
  assert.deepEqual(row, { key: "inbox:n2", kind: "comment-mention", issueId: "id-IN-2", identifier: "IN-2", title: "Issue IN-2", url: "https://linear.example.invalid/IN-2#comment-9", actor: null, at: item.createdAt, dueDate: null });
});

test("a due row is dated by its issue and shows the due date of an inbox row too", () => {
  const out = glance(board({ issues: [issue("IN-1", { dueDate: day(1) })], inbox: [inboxItem(1, "assigned")] }), NOW);
  assert.equal(out.feed[0]?.dueDate, day(1));
});

test("the feed holds at most five rows", () => {
  const issues = Array.from({ length: 9 }, (_, i) => issue(`P-${i}`, { priority: 1 }));
  const out = glance(board({ issues }), NOW);
  assert.equal(out.feed.length, FEED_LIMIT);
  assert.equal(out.counts.urgent, 9);
});

test("days until due counts local calendar days", () => {
  assert.equal(daysUntilDue(day(0), NOW), 0);
  assert.equal(daysUntilDue(day(2), NOW), 2);
  assert.equal(daysUntilDue(day(-3), NOW), -3);
});

test("the card shows once Linear is known to be connected", () => {
  assert.equal(linearCardShown(null), false);
  assert.equal(linearCardShown(board({ configured: false, ok: false, error: "Missing API key" })), false);
  assert.equal(linearCardShown(board({ ok: false, error: "Linear refused this key (401)." })), false);
  assert.equal(linearCardShown(board({ ok: false, error: "Linear is unreachable." })), true);
  assert.equal(linearCardShown(board()), true);
});

test("linkedIdentifiers finds identifiers anywhere in a title, in any case", () => {
  const set = linkedIdentifiers([thread("1", { title: "ABC-123 Fix login" }), thread("2", { title: "Fix login (abc-124)" }), thread("3", { title: "no ticket here" })]);
  assert.deepEqual([...set].sort(), ["ABC-123", "ABC-124"]);
});

test("ABC-1234 does not link ABC-123", () => {
  assert.equal(linkedIdentifiers([thread("1", { title: "ABC-1234 work" })]).has("ABC-123"), false);
});

test("settled threads still link their ticket", () => {
  assert.equal(linkedIdentifiers([thread("1", { title: "ABC-1 x", settled: true })]).has("ABC-1"), true);
});
