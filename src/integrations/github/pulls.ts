import { isRepository } from "../../../shared/pulls.ts";
import type { PrCheckRun, PrChecks, PrDetail, PrReview, PrSummary } from "../../../shared/pulls.ts";
import { parse } from "../contract.ts";
import { IntegrationError } from "../errors.ts";
import type { GhResult, GhRun } from "./gh.ts";
import { PrView, SearchResponse, type RawCheck, type SearchNode } from "./schemas.ts";

const SEARCH_LIMIT = 50;
export const MAX_DIFF_BYTES = 2 * 1024 * 1024;
const VIEW_FIELDS = "number,title,url,author,isDraft,state,headRefName,baseRefName,headRefOid,createdAt,updatedAt,additions,deletions,changedFiles,body,reviewDecision,reviews,statusCheckRollup";
// gh exits with 4 when it has no valid login.
const EXIT_NOT_AUTHENTICATED = 4;

const QUERY = `query($q: String!, $n: Int!) {
  search(query: $q, type: ISSUE, first: $n) {
    nodes {
      ... on PullRequest {
        number title url isDraft headRefName baseRefName createdAt updatedAt additions deletions reviewDecision
        author { login }
        repository { nameWithOwner }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
      }
    }
  }
}`;

const SCOPES = { author: "is:pr is:open author:@me archived:false", reviewer: "is:pr is:open review-requested:@me archived:false" } as const;

// The messages are shown to the user: they never carry gh's own output.
async function exec(run: GhRun, args: string[], maxBytes?: number): Promise<GhResult> {
  const result = await run(args, maxBytes === undefined ? undefined : { maxBytes });
  if (result.code === 0) return result;
  if (result.notFound) throw new IntegrationError("This pull request does not exist, or this GitHub account cannot see it", { system: "github", kind: "refused", reason: "not_found" });
  if (result.code === EXIT_NOT_AUTHENTICATED) throw new IntegrationError("GitHub CLI is not signed in: run gh auth login on the server", { system: "github", kind: "not-authenticated" });
  if (result.code === null) throw new IntegrationError("GitHub CLI did not answer: is gh installed on the server?", { system: "github", kind: "unreachable" });
  throw new IntegrationError("GitHub refused the request", { system: "github", kind: "refused" });
}

const json = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    throw new IntegrationError("GitHub CLI returned unreadable output", { system: "github", kind: "protocol" });
  }
};

export const reviewOf = (decision: string | null | undefined): PrReview =>
  decision === "APPROVED" ? "approved" : decision === "CHANGES_REQUESTED" ? "changes_requested" : decision === "REVIEW_REQUIRED" ? "review_required" : "none";

const rollupOf = (state: string | null | undefined): PrChecks =>
  state === "SUCCESS" ? "success" : state === "FAILURE" || state === "ERROR" ? "failure" : state === "PENDING" || state === "EXPECTED" ? "pending" : "none";

export function checkRunOf(raw: RawCheck): PrCheckRun {
  if (raw.__typename === "StatusContext") {
    const state = rollupOf(raw.state);
    return { name: raw.context ?? "status", state: state === "none" ? "neutral" : state, url: raw.targetUrl || null };
  }
  const conclusion = raw.conclusion ?? "";
  const state: PrCheckRun["state"] =
    raw.status !== "COMPLETED" ? "pending"
    : conclusion === "SUCCESS" ? "success"
    : conclusion === "SKIPPED" ? "skipped"
    : conclusion === "NEUTRAL" ? "neutral"
    : "failure";
  return { name: raw.name ?? "check", state, url: raw.detailsUrl || null };
}

/** Failure beats pending, pending beats success; skipped and neutral runs count for nothing. */
export function summarizeChecks(runs: PrCheckRun[]): PrChecks {
  if (runs.some((run) => run.state === "failure")) return "failure";
  if (runs.some((run) => run.state === "pending")) return "pending";
  return runs.some((run) => run.state === "success") ? "success" : "none";
}

export function summaryOf(node: SearchNode | null, role: "author" | "reviewer"): PrSummary | null {
  const repository = node?.repository?.nameWithOwner;
  if (!node || !repository || !isRepository(repository) || !node.number || !node.url) return null;
  return {
    repository,
    number: node.number,
    title: node.title ?? "",
    url: node.url,
    author: node.author?.login ?? "",
    draft: node.isDraft === true,
    headRef: node.headRefName ?? "",
    baseRef: node.baseRefName ?? "",
    createdAt: node.createdAt ?? "",
    updatedAt: node.updatedAt ?? "",
    additions: node.additions ?? 0,
    deletions: node.deletions ?? 0,
    checks: rollupOf(node.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state),
    review: reviewOf(node.reviewDecision),
    roles: [role],
  };
}

async function search(run: GhRun, role: "author" | "reviewer"): Promise<PrSummary[]> {
  const { stdout } = await exec(run, ["api", "graphql", "-f", `query=${QUERY}`, "-f", `q=${SCOPES[role]}`, "-F", `n=${SEARCH_LIMIT}`]);
  const { data } = parse(SearchResponse, json(stdout), { system: "github", what: "GitHub pull request search" });
  return data.search.nodes.flatMap((node) => summaryOf(node, role) ?? []);
}

/** Your open pull requests and the ones that wait for your review, newest first. A PR in both lists keeps both roles. */
export async function listPulls(run: GhRun): Promise<PrSummary[]> {
  const [authored, requested] = await Promise.all([search(run, "author"), search(run, "reviewer")]);
  const merged = new Map<string, PrSummary>();
  for (const pr of [...authored, ...requested]) {
    const key = `${pr.repository}#${pr.number}`;
    const known = merged.get(key);
    if (known) known.roles = [...new Set([...known.roles, ...pr.roles])];
    else merged.set(key, pr);
  }
  return [...merged.values()].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

function assertRef(repository: string, number: number): void {
  if (!isRepository(repository) || !Number.isInteger(number) || number < 1) throw new Error("Invalid pull request reference");
}

/** `roles` is empty: only the list knows how the PR relates to you. */
export async function getPull(run: GhRun, repository: string, number: number): Promise<PrDetail> {
  assertRef(repository, number);
  const { stdout } = await exec(run, ["pr", "view", String(number), "-R", repository, "--json", VIEW_FIELDS]);
  const raw = parse(PrView, json(stdout), { system: "github", what: "GitHub pull request" });
  if (!raw.url || !raw.headRefOid) throw new IntegrationError("GitHub returned a pull request without its address", { system: "github", kind: "protocol" });
  const checkRuns = (raw.statusCheckRollup ?? []).map(checkRunOf);
  const state = raw.state === "MERGED" ? "merged" : raw.state === "CLOSED" ? "closed" : "open";
  return {
    repository,
    number,
    title: raw.title ?? "",
    url: raw.url,
    author: raw.author?.login ?? "",
    draft: raw.isDraft === true,
    headRef: raw.headRefName ?? "",
    baseRef: raw.baseRefName ?? "",
    createdAt: raw.createdAt ?? "",
    updatedAt: raw.updatedAt ?? "",
    additions: raw.additions ?? 0,
    deletions: raw.deletions ?? 0,
    checks: summarizeChecks(checkRuns),
    review: reviewOf(raw.reviewDecision),
    roles: [],
    state,
    headSha: raw.headRefOid,
    body: raw.body ?? "",
    checkRuns,
    reviews: (raw.reviews ?? []).map((review) => ({ author: review.author?.login ?? "", state: review.state ?? "", submittedAt: review.submittedAt ?? null })),
    changedFiles: raw.changedFiles ?? 0,
  };
}

/** The raw unified diff, cut at MAX_DIFF_BYTES. */
export async function getDiff(run: GhRun, repository: string, number: number): Promise<{ text: string; truncated: boolean }> {
  assertRef(repository, number);
  const { stdout, truncated } = await exec(run, ["pr", "diff", String(number), "-R", repository, "--color=never"], MAX_DIFF_BYTES);
  return { text: stdout, truncated };
}
