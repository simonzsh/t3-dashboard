import type { ActivityPeriod, DashboardThread, UsageCostStatus, UsageDay, UsageOverview, UsageTotals } from "../../shared/api.ts";
import { IntegrationError } from "../integrations/errors.ts";
import type { RawUsageSummary, T3Port } from "../integrations/t3/schemas.ts";

// Short, so a scan that is still running shows its progress on the next poll.
const CACHE_MS = 10_000;
const MAX_READS = 8;
const OLD_T3 = "This T3 Code version does not report usage.";
const UNKNOWN_METHOD = /unknown|not found|no handler|not implemented/i;

export interface UsageOptions {
  port: Pick<T3Port, "threadProjection" | "usageSummary">;
  threads: () => DashboardThread[];
  now: () => Date;
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

// en-CA writes a date as "YYYY-MM-DD".
const dayFormat = (timeZone: string) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

/** The local calendar days, oldest first, as "YYYY-MM-DD". */
function windowDays(zone: Intl.DateTimeFormat, now: Date, count: number): string[] {
  const today = zone.format(now);
  const [year, month, day] = today.split("-").map(Number) as [number, number, number];
  // Plain calendar arithmetic in UTC: a daylight-saving change cannot skip or repeat a day.
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, month - 1, day - (count - 1 - index))).toISOString().slice(0, 10));
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

/** The Dashboard usage numbers: turns from T3 thread histories, cost and tokens from T3's usage scan. */
export function createUsage({ port, threads, now }: UsageOptions) {
  // Run times per thread, valid while the thread's last activity stays the same.
  const runTimes = new Map<string, { activity: string; times: string[] }>();
  const cache = new Map<string, { at: number; overview: UsageOverview }>();
  const inFlight = new Map<string, Promise<UsageOverview>>();

  async function readTurns(ids: DashboardThread[]): Promise<{ runs: { id: string; time: string }[]; partial: boolean }> {
    const runs: { id: string; time: string }[] = [];
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
        for (const time of entry.times) runs.push({ id: thread.id, time });
      }
    };
    await Promise.all(Array.from({ length: Math.min(MAX_READS, ids.length) }, worker));
    return { runs, partial };
  }

  async function readCost(days: string[], timeZone: string): Promise<{ summary: RawUsageSummary | null; failure: string | null }> {
    try {
      return { summary: await port.usageSummary({ sinceDay: days[0]!, untilDay: days.at(-1)!, timeZone }), failure: null };
    } catch (error) {
      return { summary: null, failure: costFailure(error) };
    }
  }

  async function build(timeZone: string, period: ActivityPeriod): Promise<UsageOverview> {
    const at = now();
    const zone = dayFormat(timeZone);
    const dayKeys = windowDays(zone, at, 2 * period);
    const byDay = new Map<string, UsageDay>(dayKeys.map((day) => [day, { day, ...zero() }]));

    const active = threads().filter((thread) => {
      const day = localDay(zone, thread.lastActivityAt);
      return day !== null && day >= dayKeys[0]!;
    });
    // Keep entries of threads outside this window: another period may need them.
    const known = new Set(threads().map((thread) => thread.id));
    for (const id of runTimes.keys()) if (!known.has(id)) runTimes.delete(id);

    const [turns, cost] = await Promise.all([readTurns(active), readCost(dayKeys, timeZone)]);
    // A session counts in a period when one of its turns falls in it.
    const currentStart = dayKeys[period]!;
    const sessions = { current: new Set<string>(), previous: new Set<string>() };
    for (const run of turns.runs) {
      const day = localDay(zone, run.time) ?? "";
      const entry = byDay.get(day);
      if (!entry) continue;
      entry.turns++;
      (day >= currentStart ? sessions.current : sessions.previous).add(run.id);
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
      period,
      days,
      current: sum(days.slice(period)),
      previous: sum(days.slice(0, period)),
      sessions: { current: sessions.current.size, previous: sessions.previous.size },
      turnsPartial: turns.partial,
      cost: { status, detail: cost.failure, refreshing },
      readAt: at.toISOString(),
    };
  }

  return {
    async get(zone: string, period: ActivityPeriod, refresh: boolean): Promise<UsageOverview> {
      const key = `${zone}|${period}`;
      const hit = cache.get(key);
      if (!refresh && hit && now().getTime() - hit.at < CACHE_MS) return hit.overview;
      const pending = inFlight.get(key);
      if (pending) return pending;
      const read = build(zone, period)
        .then((overview) => {
          cache.set(key, { at: now().getTime(), overview });
          return overview;
        })
        .finally(() => inFlight.delete(key));
      inFlight.set(key, read);
      return read;
    },
  };
}

export type Usage = ReturnType<typeof createUsage>;
