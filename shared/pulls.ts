import type { DiffFile } from "./diff.ts";

export type PrChecks = "success" | "failure" | "pending" | "none";
export type PrReview = "approved" | "changes_requested" | "review_required" | "none";

/** `repository` is "owner/name". */
export interface PrRef {
  repository: string;
  number: number;
}

export interface PrSummary extends PrRef {
  title: string;
  url: string;
  author: string;
  draft: boolean;
  headRef: string;
  baseRef: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  checks: PrChecks;
  review: PrReview;
  /** Authored by you, and/or waiting for your review. */
  roles: Array<"author" | "reviewer">;
}

export interface PrList {
  prs: PrSummary[];
  fetchedAt: string;
}

export interface PrCheckRun {
  name: string;
  state: "success" | "failure" | "pending" | "skipped" | "neutral";
  url: string | null;
}

export interface PrReviewEntry {
  author: string;
  state: string;
  submittedAt: string | null;
}

export interface PrDetail extends PrSummary {
  state: "open" | "closed" | "merged";
  headSha: string;
  body: string;
  checkRuns: PrCheckRun[];
  reviews: PrReviewEntry[];
  changedFiles: number;
}

export interface PrDiff {
  headSha: string;
  files: DiffFile[];
  /** The raw diff went past the size cap: files after the cut are missing. */
  truncated: boolean;
}

// A GitHub owner or repository name; one that starts with "-" could pass for a gh flag.
const NAME = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;
export const isRepository = (value: string): boolean => {
  const [owner, name, ...rest] = value.split("/");
  return rest.length === 0 && owner !== undefined && name !== undefined && NAME.test(owner) && NAME.test(name) && name !== "." && name !== "..";
};
