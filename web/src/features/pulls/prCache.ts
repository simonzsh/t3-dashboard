import type { PrDetail, PrDiff, PrRef } from "../../../../shared/pulls.ts";

export const MAX_PAGES = 10;

export interface Page {
  detail: PrDetail | null;
  diff: PrDiff | null;
}

// A reopened pull request shows at once from here, then reads again. Map order is the LRU order.
const pages = new Map<string, Page>();
const keyOf = ({ repository, number }: PrRef) => `${repository}#${number}`;

export function cachedPage(ref: PrRef): Page | undefined {
  const key = keyOf(ref);
  const page = pages.get(key);
  if (page) {
    pages.delete(key);
    pages.set(key, page);
  }
  return page;
}

export function rememberPage(ref: PrRef, part: Partial<Page>): void {
  const key = keyOf(ref);
  const page = { detail: null, diff: null, ...pages.get(key), ...part };
  pages.delete(key);
  pages.set(key, page);
  if (pages.size > MAX_PAGES) pages.delete(pages.keys().next().value!);
}

export const resetPages = (): void => pages.clear();

/** The head commit to ask the diff for: the server then answers a kept diff without GitHub. */
export const diffHint = (page: Page | undefined, summary?: { headSha: string }): string | undefined => page?.diff?.headSha || page?.detail?.headSha || summary?.headSha || undefined;

/** The head commit to read the diff for again: the hint came back as the diff but the detail shows a newer head. */
export function diffFollowUp(hint: string | undefined, detail: PrDetail | null, diff: PrDiff | null): string | null {
  return hint && detail && diff && diff.headSha === hint && detail.headSha !== hint ? detail.headSha : null;
}
