import assert from "node:assert/strict";
import { test } from "bun:test";
import { checkLinear } from "../../../src/integrations/linear/contracts.ts";
import { linearInbox, linearInboxNode, linearNode, linearPage } from "../../helpers/linear.ts";

type Answer = (query: string) => Response;

// Routes on the query text, like Linear: viewer, inbox or assigned issues.
const fetchFor = (answer: Partial<Record<"viewer" | "inbox" | "issues", Answer>> = {}) => async (_url: string, init: RequestInit) => {
  const query = JSON.parse(String(init.body)).query as string;
  const route = query.includes("notifications") ? "inbox" : query.includes("assignedIssues") ? "issues" : "viewer";
  const fallback = { viewer: () => linearPage([]), inbox: () => linearInbox([linearInboxNode(1)]), issues: () => linearPage([linearNode(1)]) }[route];
  return (answer[route] ?? fallback)(query);
};

test("a good answer passes the three checks", async () => {
  const report = await checkLinear("key", fetchFor());
  assert.deepEqual([report.checks, report.findings], [3, []]);
});

test("an inbox answer that drifted is reported", async () => {
  const { issue: _issue, ...withoutIssue } = linearInboxNode(1);
  const report = await checkLinear("key", fetchFor({ inbox: () => linearInbox([withoutIssue]) }));
  assert.equal(report.findings.length, 1);
  assert.match(report.findings[0]!.text, /^inbox: /);
  assert.equal(report.findings[0]!.level, "breaking");
});

test("a GraphQL error on the inbox query is breaking", async () => {
  const report = await checkLinear("key", fetchFor({ inbox: () => new Response(JSON.stringify({ errors: [{ message: "bad" }] }), { status: 200 }) }));
  assert.deepEqual(report.findings, [{ level: "breaking", text: "inbox: Linear returned a GraphQL error for the inbox query" }]);
});

test("without a key Linear is skipped", async () => {
  const report = await checkLinear("", fetchFor());
  assert.deepEqual([report.checks, report.skipped], [0, "no Linear key is configured"]);
});
