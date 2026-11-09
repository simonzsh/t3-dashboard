import { parseDiff } from "../../../shared/diff.ts";
import type { GhRun } from "../../integrations/github/gh.ts";
import { AUDIT_DIFF, CHARTS_DIFF, CHECKOUT_DIFF, FEES_TESTS_DIFF, ONBOARDING_DIFF, RATE_LIMIT_DIFF } from "./diffs.ts";

type Conclusion = "SUCCESS" | "FAILURE" | "PENDING";

interface DemoPr {
  repository: string;
  number: number;
  title: string;
  author: string;
  draft: boolean;
  headRef: string;
  /** The branch it merges into; a stacked pull request targets the one below it. */
  baseRef?: string;
  /** Minutes before the demo started: a fixed time, so a poll never makes a pull request new again. */
  created: number;
  /** Minutes before now. */
  updated: number;
  decision: string | null;
  checks: Array<[name: string, result: Conclusion]>;
  reviews: Array<[author: string, state: string]>;
  scope: "author" | "reviewer";
  body: string;
  diff: string;
}

const PRS: DemoPr[] = [
  {
    repository: "acme/atlas-web", number: 142, title: "ATL-142 Redesign the checkout summary", author: "ada", draft: false, headRef: "checkout-summary", created: 2880, updated: 6, decision: "APPROVED",
    checks: [["build", "SUCCESS"], ["unit tests", "SUCCESS"], ["lint", "SUCCESS"]], reviews: [["grace", "APPROVED"]], scope: "author",
    body: "Totals now come first, and shipping, taxes and fees sit under one row that opens on demand.\n\n## Changes\n\n- `OrderSummary` shows the total first.\n- New `Fees` row, closed by default.\n- `formatPrice` moves to `lib/`.\n\n## Test\n\nOpen the cart with a shipping fee and check the Fees row.", diff: CHECKOUT_DIFF,
  },
  {
    repository: "acme/atlas-web", number: 143, title: "ATL-143 Tests for the checkout fees row", author: "ada", draft: false, headRef: "checkout-fees-tests", baseRef: "checkout-summary", created: 0, updated: 4,
    decision: "REVIEW_REQUIRED", checks: [["build", "SUCCESS"], ["unit tests", "PENDING"]], reviews: [], scope: "author", body: "Stacked on #142.", diff: FEES_TESTS_DIFF,
  },
  {
    repository: "acme/atlas-api", number: 149, title: "ATL-149 Add rate limiting to public endpoints", author: "ada", draft: false, headRef: "rate-limit", created: 1440, updated: 35, decision: "REVIEW_REQUIRED",
    checks: [["build", "SUCCESS"], ["integration tests", "PENDING"]], reviews: [], scope: "author", body: "A sliding window per client: 120 requests a minute.", diff: RATE_LIMIT_DIFF,
  },
  {
    repository: "acme/atlas-api", number: 151, title: "Audit log for admin actions", author: "ada", draft: true, headRef: "audit-log", created: 4320, updated: 600, decision: null,
    checks: [], reviews: [], scope: "author", body: "", diff: AUDIT_DIFF,
  },
  {
    repository: "acme/atlas-web", number: 138, title: "Dark mode contrast on charts", author: "grace", draft: false, headRef: "chart-contrast", created: 2000, updated: 90, decision: "CHANGES_REQUESTED",
    checks: [["build", "SUCCESS"], ["unit tests", "FAILURE"]], reviews: [["linus", "CHANGES_REQUESTED"], ["ada", "COMMENTED"]], scope: "reviewer", body: "Darker lines on the chart grid.", diff: CHARTS_DIFF,
  },
  {
    repository: "acme/atlas-mobile", number: 57, title: "Onboarding copy for the mobile app", author: "linus", draft: false, headRef: "onboarding-copy", created: 5000, updated: 1500, decision: "REVIEW_REQUIRED",
    checks: [["build", "SUCCESS"]], reviews: [], scope: "reviewer", body: "New welcome line.", diff: ONBOARDING_DIFF,
  },
];

const rollup = ({ checks }: DemoPr): Conclusion | null =>
  checks.length === 0 ? null : checks.some(([, result]) => result === "FAILURE") ? "FAILURE" : checks.some(([, result]) => result === "PENDING") ? "PENDING" : "SUCCESS";

const url = (pr: DemoPr) => `https://example.test/${pr.repository}/pull/${pr.number}`;
const totals = (pr: DemoPr) => parseDiff(pr.diff).reduce((sum, file) => ({ additions: sum.additions + file.additions, deletions: sum.deletions + file.deletions }), { additions: 0, deletions: 0 });

const searchNode = (pr: DemoPr, now: Date, start: Date) => ({
  number: pr.number,
  title: pr.title,
  url: url(pr),
  isDraft: pr.draft,
  headRefName: pr.headRef,
  headRefOid: `demo${pr.number}`.padEnd(40, "0"),
  baseRefName: pr.baseRef ?? "main",
  createdAt: new Date(start.getTime() - pr.created * 60_000).toISOString(),
  // Never before the creation time, even in the first minutes of the demo.
  updatedAt: new Date(Math.max(now.getTime() - pr.updated * 60_000, start.getTime() - pr.created * 60_000)).toISOString(),
  ...totals(pr),
  reviewDecision: pr.decision,
  author: { login: pr.author },
  repository: { nameWithOwner: pr.repository },
  commits: { nodes: [{ commit: { statusCheckRollup: rollup(pr) && { state: rollup(pr) } } }] },
});

const view = (pr: DemoPr, now: Date, start: Date) => ({
  ...searchNode(pr, now, start),
  state: "OPEN",
  changedFiles: parseDiff(pr.diff).length,
  body: pr.body,
  reviews: pr.reviews.map(([author, state]) => ({ author: { login: author }, state, submittedAt: new Date(now.getTime() - (pr.updated + 5) * 60_000).toISOString() })),
  statusCheckRollup: pr.checks.map(([name, result]) => ({
    __typename: "CheckRun",
    name,
    status: result === "PENDING" ? "IN_PROGRESS" : "COMPLETED",
    conclusion: result === "PENDING" ? "" : result,
    detailsUrl: `https://example.test/${pr.repository}/actions/${pr.number}`,
  })),
});

/** Answers the gh calls of the Pull requests page from the demo pull requests: the demo never starts the real gh. */
export function demoGh(now: () => Date): GhRun {
  const start = now();
  const reply = (value: unknown) => ({ code: 0, stdout: typeof value === "string" ? value : JSON.stringify(value), truncated: false });
  return async (args) => {
    if (args[0] === "api") {
      const scope = args.some((arg) => arg.includes("review-requested")) ? "reviewer" : "author";
      return reply({ data: { search: { nodes: PRS.filter((pr) => pr.scope === scope).map((pr) => searchNode(pr, now(), start)) } } });
    }
    const pr = PRS.find((candidate) => candidate.repository === args[args.indexOf("-R") + 1] && String(candidate.number) === args[2]);
    if (!pr) return { code: 1, stdout: "", truncated: false, notFound: true };
    return reply(args[1] === "diff" ? pr.diff : view(pr, now(), start));
  };
}
