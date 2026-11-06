import type { DashboardThread, UsageCostStatus, UsageDay, UsageOverview, UsageTotals } from "../../shared/api.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { RawUsageSummary, T3Port } from "../integrations/t3/schemas.ts";

const DAYS = 14;
const WEEK = 7;
const CACHE_MS = 60_000;
// T3 is still scanning, or had nothing to give: look again soon.
const SHORT_CACHE_MS = 10_000;
const MAX_READS = 4;
const OLD_T3 = "This T3 Code version does not report usage.";
const UNKNOWN_METHOD = /unknown|not found|no handler|not implemented/i;

export interface UsageOptions {
  port: Pick<T3Port, "threadProjection" | "usageSummary">;
  threads: () => DashboardThread[];
  now: () => Date;
  serverTimeZone: string;
}

// Sums of floats: keep the cents, drop the noise.
const cents = (usd: number): number => Math.round(usd * 100) / 100;

const zero = (): UsageTotals => ({ turns: 0, costUsd: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 });

function sum(days: UsageDay[]): UsageTotals {
  const total = zero();
  for (const day of days) {
    total.turns += day.turns;
    total.costUsd += day.costUsd;
    total.inputTokens += day.inputTokens;
    total.cachedInputTokens += day.cachedInputTokens;
    total.outputTokens += day.outputTokens;
  }
  return { ...total, costUsd: cents(total.costUsd) };
}

/** The local calendar days, oldest first, as "YYYY-MM-DD". */
function windowDays(timeZone: string, now: Date): string[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  // Plain calendar arithmetic in UTC: a daylight-saving change cannot skip or repeat a day.
  return Array.from({ length: DAYS }, (_, index) => new Date(Date.UTC(year, month - 1, day - (DAYS - 1 - index))).toISOString().slice(0, 10));
}

const localDay = (zone: Intl.DateTimeFormat, iso: string): string | null => {
  const time = Date.parse(iso);
  return Number.isNaN(time) ? null : zone.format(time);
};

function costFailure(error: unknown): string {
  if (!(error instanceof IntegrationError)) return error instanceof Error ? error.message : "T3 sent no usage.";
  if (error.kind === "protocol" || (error.kind === "refused" && UNKNOWN_METHOD.test(error.message))) return OLD_T3;
  return error.message;
}

/** The Home page numbers: turns from T3 thread histories, cost and tokens from T3's usage scan. */
export function createUsage({ port, threads, now, serverTimeZone }: UsageOptions) {
  // Run times per thread, valid while the thread's last activity stays the same.
  const runTimes = new Map<string, { activity: string; times: string[] }>();
  const cache = new Map<string, { at: number; ttl: number; overview: UsageOverview }>();
  const inFlight = new Map<string, Promise<UsageOverview>>();

  async function readTurns(ids: DashboardThread[]): Promise<{ times: string[]; partial: boolean }> {
    const times: string[] = [];
    let partial = false;
    const queue = [...ids];
    const worker = async () => {
      for (let thread = queue.shift(); thread; thread = queue.shift()) {
        let entry = runTimes.get(thread.id);
        if (entry?.activity !== thread.lastActivityAt) {
          try {
            const { runs = [] } = await port.threadProjection(thread.id);
            entry = { activity: thread.lastActivityAt, times: runs.map((run) => run.startedAt ?? run.requestedAt ?? run.createdAt).filter((at): at is string => typeof at === "string") };
            runTimes.set(thread.id, entry);
          } catch {
            partial = true;
            continue;
          }
        }
        times.push(...entry.times);
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_READS, ids.length) }, worker));
    return { times, partial };
  }

  async function readCost(days: string[], timeZone: string): Promise<{ summary: RawUsageSummary | null; failure: string | null }> {
    try {
      return { summary: await port.usageSummary({ sinceDay: days[0]!, untilDay: days.at(-1)!, timeZone }), failure: null };
    } catch (error) {
      return { summary: null, failure: costFailure(error) };
    }
  }

  async function build(timeZone: string): Promise<UsageOverview> {
    const at = now();
    const dayKeys = windowDays(timeZone, at);
    const byDay = new Map<string, UsageDay>(dayKeys.map((day) => [day, { day, ...zero() }]));
    const zone = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

    const active = threads().filter((thread) => {
      const day = localDay(zone, thread.lastActivityAt);
      return day !== null && day >= dayKeys[0]!;
    });
    const ids = new Set(active.map((thread) => thread.id));
    for (const id of runTimes.keys()) if (!ids.has(id)) runTimes.delete(id);

    const [turns, cost] = await Promise.all([readTurns(active), readCost(dayKeys, timeZone)]);
    for (const time of turns.times) {
      const entry = byDay.get(localDay(zone, time) ?? "");
      if (entry) entry.turns++;
    }

    let status: UsageCostStatus = cost.failure === null ? "ok" : "unavailable";
    for (const bucket of cost.summary?.buckets ?? []) {
      const entry = byDay.get(bucket.day);
      if (!entry) continue;
      const { uncachedInputTokens = 0, cachedInputTokens = 0, cacheCreationTokens = 0, outputTokens = 0 } = bucket.totals ?? {};
      entry.costUsd += bucket.costUsd ?? 0;
      entry.inputTokens += uncachedInputTokens + cachedInputTokens + cacheCreationTokens;
      entry.cachedInputTokens += cachedInputTokens;
      entry.outputTokens += outputTokens;
      if ((bucket.unpricedRecords ?? 0) > 0 || bucket.costSource === "unpriced") status = "partial";
    }
    const refreshing = cost.summary?.sources?.some((source) => source.refreshing === true) ?? false;

    const days = [...byDay.values()].map((day) => ({ ...day, costUsd: cents(day.costUsd) }));
    return {
      timeZone,
      days,
      thisWeek: sum(days.slice(DAYS - WEEK)),
      lastWeek: sum(days.slice(0, DAYS - WEEK)),
      total: sum(days),
      activeThreads: active.length,
      turnsPartial: turns.partial,
      cost: { status, detail: status === "partial" ? "Some models are not priced, so the cost may be low." : cost.failure, refreshing },
      readAt: at.toISOString(),
    };
  }

  return {
    async get(timeZone: string | undefined, refresh: boolean): Promise<UsageOverview> {
      const zone = timeZone ?? serverTimeZone;
      const hit = cache.get(zone);
      if (!refresh && hit && now().getTime() - hit.at < hit.ttl) return hit.overview;
      const pending = inFlight.get(zone);
      if (pending) return pending;
      const read = build(zone)
        .then((overview) => {
          const short = overview.cost.refreshing || overview.cost.status === "unavailable";
          cache.set(zone, { at: now().getTime(), ttl: short ? SHORT_CACHE_MS : CACHE_MS, overview });
          return overview;
        })
        .finally(() => inFlight.delete(zone));
      inFlight.set(zone, read);
      return read;
    },
  };
}

export type Usage = ReturnType<typeof createUsage>;
