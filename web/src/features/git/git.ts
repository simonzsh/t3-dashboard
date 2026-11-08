import type { BadgeVariant } from "../../ui/index.ts";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrChecks, PrRef, PrReview, PrSummary } from "../../../../shared/git.ts";

export type Scope = "all" | "author" | "reviewer";

export const SCOPES: ReadonlyArray<{ id: Scope; label: string }> = [
  { id: "all", label: "All" },
  { id: "author", label: "Mine" },
  { id: "reviewer", label: "To review" },
];

export const ALL_REPOSITORIES = "all";

export function filterPrs(prs: PrSummary[], scope: Scope, repository: string): PrSummary[] {
  return prs.filter((pr) => (scope === "all" || pr.roles.includes(scope)) && (repository === ALL_REPOSITORIES || pr.repository === repository));
}

export const repositoriesOf = (prs: PrSummary[]): string[] => [...new Set(prs.map((pr) => pr.repository))].sort();

/** Pull requests by repository, repositories in name order, each keeping the order it came in (newest first). */
export function groupByRepository(prs: PrSummary[]): Array<{ repository: string; prs: PrSummary[] }> {
  return repositoriesOf(prs).map((repository) => ({ repository, prs: prs.filter((pr) => pr.repository === repository) }));
}

/** The session linked to a pull request: threads come newest first, so the most recent one wins. */
export const sessionOf = (threads: DashboardThread[], ref: PrRef): DashboardThread | null =>
  threads.find((thread) => thread.pullRequest?.repository === ref.repository && thread.pullRequest.number === ref.number) ?? null;

export const CHECKS: Record<PrChecks, { label: string; variant: BadgeVariant } | null> = {
  success: { label: "Checks passed", variant: "done" },
  failure: { label: "Checks failed", variant: "error" },
  pending: { label: "Checks running", variant: "running" },
  none: null,
};

export const REVIEWS: Record<PrReview, { label: string; variant: BadgeVariant } | null> = {
  approved: { label: "Approved", variant: "done" },
  changes_requested: { label: "Changes requested", variant: "error" },
  review_required: { label: "Review required", variant: "waiting" },
  none: null,
};

/** Only a web address becomes a link: the page never puts another scheme in an href. */
export const isWebUrl = (url: string): boolean => /^https:\/\//i.test(url);

export const shortRepository = (repository: string): string => repository.slice(repository.indexOf("/") + 1);
