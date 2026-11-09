import assert from "node:assert/strict";
import { test } from "bun:test";
import type { PrSummary } from "../../../../shared/pulls.ts";
import { filterPrs, pullsPollMs, groupByRepository, isWebUrl, repositoriesOf, sessionsOf, shortRepository } from "../../../src/features/pulls/pulls.ts";
import { thread } from "../../fixtures.ts";

const pr = (repository: string, number: number, roles: PrSummary["roles"]): PrSummary => ({
  repository, number, title: `PR ${number}`, url: `https://example.test/${repository}/pull/${number}`, author: "ada", draft: false, headRef: "b", baseRef: "main",
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", additions: 1, deletions: 1, checks: "success", review: "none", roles, headSha: "",
});
const prs = [pr("acme/storefront", 1, ["author"]), pr("acme/api", 2, ["reviewer"]), pr("acme/storefront", 3, ["author", "reviewer"])];

test("the scope keeps authored, review-requested or every pull request", () => {
  assert.deepEqual(filterPrs(prs, "all", "all").map((p) => p.number), [1, 2, 3]);
  assert.deepEqual(filterPrs(prs, "author", "all").map((p) => p.number), [1, 3]);
  assert.deepEqual(filterPrs(prs, "reviewer", "all").map((p) => p.number), [2, 3]);
  assert.deepEqual(filterPrs(prs, "unread", "all", "", (p) => p.number !== 2).map((p) => p.number), [1, 3]);
  assert.deepEqual(filterPrs(prs, "unread", "all").map((p) => p.number), []);
});

test("the repository filter narrows the list", () => {
  assert.deepEqual(filterPrs(prs, "all", "acme/api").map((p) => p.number), [2]);
  assert.deepEqual(filterPrs(prs, "reviewer", "acme/storefront").map((p) => p.number), [3]);
});

test("the search matches the title, the number, the repository, the author and the branch", () => {
  assert.deepEqual(filterPrs(prs, "all", "all", "pr 2").map((p) => p.number), [2]);
  assert.deepEqual(filterPrs(prs, "all", "all", "#3").map((p) => p.number), [3]);
  assert.deepEqual(filterPrs(prs, "all", "all", "API").map((p) => p.number), [2]);
  assert.deepEqual(filterPrs(prs, "author", "all", "ada").map((p) => p.number), [1, 3]);
  assert.deepEqual(filterPrs(prs, "all", "all", "nothing"), []);
});

test("pull requests are grouped by repository in name order, keeping their order inside a group", () => {
  assert.deepEqual(repositoriesOf(prs), ["acme/api", "acme/storefront"]);
  assert.deepEqual(groupByRepository(prs).map((g) => [g.repository, g.prs.map((p) => p.number)]), [["acme/api", [2]], ["acme/storefront", [1, 3]]]);
});

test("a pull request finds every session tied to it, newest first, whatever the repository's case", () => {
  const link = (number: number, repository = "acme/storefront") => ({ repository, number, url: "https://example.test/x", title: null });
  const threads = [thread("a", { pullRequests: [link(2)] }), thread("b", { pullRequests: [link(1), link(2)] }), thread("c", { pullRequests: [link(1, "Acme/Storefront")] }), thread("d")];
  assert.deepEqual(sessionsOf(threads, { repository: "acme/storefront", number: 1 }).map((t) => t.id), ["b", "c"]);
  assert.deepEqual(sessionsOf(threads, { repository: "acme/storefront", number: 2 }).map((t) => t.id), ["a", "b"]);
  assert.deepEqual(sessionsOf(threads, { repository: "acme/api", number: 1 }), []);
});

test("only web addresses become links", () => {
  assert.equal(isWebUrl("https://example.test/p"), true);
  assert.equal(isWebUrl("javascript:alert(1)"), false);
  assert.equal(isWebUrl("//example.test"), false);
  assert.equal(shortRepository("acme/storefront"), "storefront");
});

test("the list is polled every 2 minutes on its page and every 5 minutes elsewhere", () => {
  assert.equal(pullsPollMs(true), 30_000);
  assert.equal(pullsPollMs(false), 120_000);
});
