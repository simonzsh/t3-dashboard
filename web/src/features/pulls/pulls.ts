import type { BadgeVariant } from "../../ui/index.ts";
import type { DashboardThread } from "../../../../shared/api.ts";
import type { PrChecks, PrRef, PrReview, PrSummary } from "../../../../shared/pulls.ts";

export type Scope = "all" | "author" | "reviewer";

export const SCOPES: ReadonlyArray<{ id: Scope; label: string }> = [
  { id: "all", label: "All" },
  { id: "author", label: "Mine" },
  { id: "reviewer", label: "To review" },
];

export const ALL_REPOSITORIES = "all";

export function filterPrs(prs: PrSummary[], scope: Scope, repository: string, query = ""): PrSummary[] {
  const text = query.trim().toLowerCase().replace(/^#/, "");
  return prs.filter(
    (pr) =>
      (scope === "all" || pr.roles.includes(scope)) &&
      (repository === ALL_REPOSITORIES || pr.repository === repository) &&
      (text === "" || [pr.title, pr.repository, String(pr.number), pr.author, pr.headRef].some((field) => field.toLowerCase().includes(text))),
  );
}

export const repositoriesOf = (prs: PrSummary[]): string[] => [...new Set(prs.map((pr) => pr.repository))].sort();

/** Pull requests by repository, repositories in name order, each keeping the order it came in (newest first). */
export function groupByRepository(prs: PrSummary[]): Array<{ repository: string; prs: PrSummary[] }> {
  return repositoriesOf(prs).map((repository) => ({ repository, prs: prs.filter((pr) => pr.repository === repository) }));
}

/** The sessions tied to a pull request, newest first as threads come; T3 ignores the repository's case. */
export const sessionsOf = (threads: DashboardThread[], ref: PrRef): DashboardThread[] =>
  threads.filter((thread) => thread.pullRequests.some((pr) => pr.number === ref.number && pr.repository.toLowerCase() === ref.repository.toLowerCase()));

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
