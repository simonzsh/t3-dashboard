import type { PrRef, PrSummary } from "../../../shared/pulls.ts";
import { isUnseenAt, type SeenState } from "../../../shared/seen.ts";

// A pull request is unread from its creation until the user opens it. The mark lives in the shared seen state.
export const prMarkId = ({ repository, number }: PrRef) => `pr:${repository.toLowerCase()}#${number}`;

/** The mark to send when the pull request is opened. GitHub sends times without milliseconds: the seen state compares strings. */
export function prMark(pr: PrRef & { createdAt: string }): { id: string; at: string } | null {
  const time = Date.parse(pr.createdAt);
  return Number.isNaN(time) ? null : { id: prMarkId(pr), at: new Date(time).toISOString() };
}

export function isUnreadPr(pr: PrSummary, seen: SeenState): boolean {
  const mark = prMark(pr);
  return mark !== null && isUnseenAt(mark.id, mark.at, seen);
}

/** Sorted, so a caller can tell a change of the set from a change of the list. */
export const unreadPrIds = (prs: readonly PrSummary[], seen: SeenState): string[] => prs.filter((pr) => isUnreadPr(pr, seen)).map(prMarkId).sort();
