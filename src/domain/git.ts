import { parseDiff } from "../../shared/diff.ts";
import type { PrDetail, PrDiff, PrList } from "../../shared/git.ts";
import type { GhRun } from "../integrations/github/gh.ts";
import { getDiff, getPull, listPulls } from "../integrations/github/pulls.ts";

const CACHE_MS = 60_000;
const MAX_DETAILS = 50;
const MAX_DIFFS = 20;

export interface GitReviewOptions {
  run: GhRun;
  now: () => Date;
}

// Evicts the oldest entry: a Map keeps insertion order.
function remember<V>(cache: Map<string, V>, key: string, value: V, max: number): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
}

/** Open pull requests, their detail and their diff, read through gh and cached so a poll costs no call. */
export class GitReview {
  private readonly options: GitReviewOptions;
  private list: { at: number; value: PrList } | null = null;
  private listing: Promise<PrList> | null = null;
  private readonly details = new Map<string, { at: number; value: PrDetail }>();
  private readonly reading = new Map<string, Promise<PrDetail>>();
  private readonly diffs = new Map<string, PrDiff>();

  constructor(options: GitReviewOptions) {
    this.options = options;
  }

  async prs(refresh = false): Promise<PrList> {
    const now = this.options.now().getTime();
    if (!refresh && this.list && now - this.list.at < CACHE_MS) return this.list.value;
    // Two readers at once share one pair of gh calls.
    this.listing ??= this.readList().finally(() => (this.listing = null));
    return this.listing;
  }

  private async readList(): Promise<PrList> {
    const prs = await listPulls(this.options.run);
    const at = this.options.now();
    const value = { prs, fetchedAt: at.toISOString() };
    this.list = { at: at.getTime(), value };
    return value;
  }

  async detail(repository: string, number: number, refresh = false): Promise<PrDetail> {
    const key = `${repository}#${number}`;
    const now = this.options.now().getTime();
    const known = this.details.get(key);
    if (!refresh && known && now - known.at < CACHE_MS) return known.value;
    // The page asks for the detail and the diff at once: both share one gh call.
    let pending = this.reading.get(key);
    if (!pending) {
      pending = getPull(this.options.run, repository, number)
        .then((value) => {
          remember(this.details, key, { at: now, value }, MAX_DETAILS);
          return value;
        })
        .finally(() => this.reading.delete(key));
      this.reading.set(key, pending);
    }
    return pending;
  }

  /** A diff never changes for one head commit, so the head SHA is the cache key. */
  async diff(repository: string, number: number, refresh = false): Promise<PrDiff> {
    const { headSha } = await this.detail(repository, number, refresh);
    const key = `${repository}#${number}@${headSha}`;
    const known = this.diffs.get(key);
    if (known) return known;
    const { text, truncated } = await getDiff(this.options.run, repository, number);
    const files = parseDiff(text);
    // The cut falls inside the last file: drop it rather than show part of it.
    if (truncated) files.pop();
    const value = { headSha, files, truncated };
    remember(this.diffs, key, value, MAX_DIFFS);
    return value;
  }
}
