import { parseDiff } from "../../shared/diff.ts";
import type { PrDetail, PrDiff, PrList } from "../../shared/pulls.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { GhRun } from "../integrations/github/gh.ts";
import { getDiff, getPull, listPulls } from "../integrations/github/pulls.ts";
import { DomainError } from "./errors.ts";

const CACHE_MS = 60_000;
// Past CACHE_MS a list is still served at once, marked stale, while a new read runs; past STALE_MS the reader waits.
const STALE_MS = 600_000;
const MAX_DETAILS = 50;
const MAX_DIFFS = 20;

export interface PullRequestsOptions {
  run: GhRun;
  now: () => Date;
}

// An unknown pull request is the caller's mistake (404), not a GitHub failure (502).
function asNotFound(error: unknown): never {
  if (error instanceof IntegrationError && error.reason === "not_found") throw new DomainError("not-found", error.message);
  throw error;
}

// Evicts the oldest entry: a Map keeps insertion order.
function remember<V>(cache: Map<string, V>, key: string, value: V, max: number): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
}

/** Open pull requests, their detail and their diff, read through gh and cached so a poll costs no call. */
export class PullRequests {
  private readonly options: PullRequestsOptions;
  private list: { at: number; value: PrList } | null = null;
  private listing: Promise<PrList> | null = null;
  private readonly details = new Map<string, { at: number; value: PrDetail }>();
  private readonly reading = new Map<string, Promise<PrDetail>>();
  private readonly diffs = new Map<string, PrDiff>();

  constructor(options: PullRequestsOptions) {
    this.options = options;
  }

  async prs(refresh = false): Promise<PrList> {
    const now = this.options.now().getTime();
    const age = this.list ? now - this.list.at : Infinity;
    if (!refresh && this.list && age < CACHE_MS) return this.list.value;
    if (!refresh && this.list && age < STALE_MS && !this.listing) {
      // The failure is dropped: the next reader starts a new read.
      this.startListing().catch(() => {});
      return { ...this.list.value, stale: true };
    }
    return this.startListing();
  }

  // Two readers at once share one pair of gh calls.
  private startListing(): Promise<PrList> {
    return (this.listing ??= this.readList().finally(() => (this.listing = null)));
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
        .catch(asNotFound)
        .then((value) => {
          remember(this.details, key, { at: now, value }, MAX_DETAILS);
          return value;
        })
        .finally(() => this.reading.delete(key));
      this.reading.set(key, pending);
    }
    return pending;
  }

  /** A diff never changes for one head commit, so the head SHA is the cache key. Without a SHA, or on refresh,
   *  the head is read fresh. With a SHA, the caller owns freshness: the page asks with the newest head it knows. */
  async diff(repository: string, number: number, options: { sha?: string; refresh?: boolean } = {}): Promise<PrDiff> {
    // A caller that knows the head commit skips the gh call: the diff of one commit never changes.
    const hint = options.sha && !options.refresh ? this.diffs.get(`${repository}#${number}@${options.sha}`) : undefined;
    if (hint) {
      remember(this.diffs, `${repository}#${number}@${options.sha}`, hint, MAX_DIFFS);
      return hint;
    }
    const { headSha } = await this.detail(repository, number, true);
    const key = `${repository}#${number}@${headSha}`;
    const known = this.diffs.get(key);
    if (known) return known;
    const { text, truncated } = await getDiff(this.options.run, repository, number).catch(asNotFound);
    const files = parseDiff(text);
    // The cut falls inside the last file: drop it rather than show part of it.
    if (truncated) files.pop();
    const value = { headSha, files, truncated };
    remember(this.diffs, key, value, MAX_DIFFS);
    return value;
  }
}
