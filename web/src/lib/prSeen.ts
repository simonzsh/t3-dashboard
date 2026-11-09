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

/** The open pull requests by `prMarkId`: their creation time and whether they are unread. */
export type OpenPrs = ReadonlyMap<string, { createdAt: string; unread: boolean }>;

export function openPrIndex(prs: readonly PrSummary[], seen: SeenState): Map<string, { createdAt: string; unread: boolean }> {
  return new Map(prs.map((pr) => [prMarkId(pr), { createdAt: prMark(pr)?.at ?? "", unread: isUnreadPr(pr, seen) }]));
}

/** Changes only when an open pull request is added, removed or read: App keys the index on it. */
export const openPrKey = (open: OpenPrs): string => [...open].map(([id, pr]) => `${id}@${pr.createdAt}${pr.unread ? "*" : ""}`).sort().join(" ");

export const unreadPrCount = (open: OpenPrs): number => [...open.values()].filter((pr) => pr.unread).length;

/** Newest first: open pull requests by creation time, then the others (merged, closed) in reverse link order, as T3 lists links oldest first. */
export function newestFirst<T extends PrRef>(links: readonly T[], open: OpenPrs): T[] {
  const created = (pr: T) => open.get(prMarkId(pr))?.createdAt ?? "";
  const reversed = [...links].reverse();
  const dated = reversed.filter((pr) => created(pr)).sort((a, b) => created(b).localeCompare(created(a)));
  return [...dated, ...reversed.filter((pr) => !created(pr))];
}
