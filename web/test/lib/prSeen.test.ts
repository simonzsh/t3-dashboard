import assert from "node:assert/strict";
import { test } from "bun:test";
import type { PrSummary } from "../../../shared/pulls.ts";
import { isUnreadPr, prMark, prMarkId, unreadPrIds } from "../../src/lib/prSeen.ts";

const pr = (repository: string, number: number, over: Partial<PrSummary> = {}): PrSummary => ({
  repository, number, title: "t", url: "u", author: "ada", draft: false, headRef: "h", baseRef: "main", createdAt: "2026-02-01T10:00:00Z", updatedAt: "2026-02-01T10:00:00Z",
  additions: 1, deletions: 1, checks: "success", review: "none", roles: ["author"], ...over,
});
const seen = (since: string, marks: Record<string, string> = {}) => ({ since, seen: marks });

test("the mark id is lowercase and the same for a summary, a route and a thread link", () => {
  assert.equal(prMarkId(pr("Acme/Web", 4)), "pr:acme/web#4");
  assert.equal(prMarkId({ repository: "acme/web", number: 4 }), "pr:acme/web#4");
  assert.equal(prMarkId({ repository: "ACME/WEB", number: 4, url: "x", title: null } as never), "pr:acme/web#4");
});

test("the mark time is the creation time in full ISO form, and null when it does not parse", () => {
  assert.deepEqual(prMark(pr("acme/web", 4)), { id: "pr:acme/web#4", at: "2026-02-01T10:00:00.000Z" });
  assert.equal(prMark(pr("acme/web", 4, { createdAt: "" })), null);
});

test("a pull request is unread from its creation until it is opened", () => {
  const item = pr("acme/web", 4);
  assert.equal(isUnreadPr(item, seen("2026-01-01T00:00:00.000Z")), true);
  assert.equal(isUnreadPr(item, seen("2026-03-01T00:00:00.000Z")), false);
  assert.equal(isUnreadPr(item, seen("2026-01-01T00:00:00.000Z", { "pr:acme/web#4": "2026-02-01T10:00:00.000Z" })), false);
});

test("a push or a comment does not make a read pull request unread again", () => {
  const marks = { "pr:acme/web#4": "2026-02-01T10:00:00.000Z" };
  assert.equal(isUnreadPr(pr("acme/web", 4, { updatedAt: "2026-02-09T10:00:00Z" }), seen("2026-01-01T00:00:00.000Z", marks)), false);
});

test("a pull request without a creation time counts as read", () => {
  assert.equal(isUnreadPr(pr("acme/web", 4, { createdAt: "" }), seen("2026-01-01T00:00:00.000Z")), false);
});

test("the unread ids are sorted and leave out the read ones", () => {
  const prs = [pr("acme/web", 9), pr("acme/api", 2), pr("acme/web", 3, { createdAt: "2025-12-01T00:00:00Z" })];
  assert.deepEqual(unreadPrIds(prs, seen("2026-01-01T00:00:00.000Z")), ["pr:acme/api#2", "pr:acme/web#9"]);
});
