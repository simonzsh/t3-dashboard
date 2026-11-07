import type { LimitsOverview, LimitWindow, LimitWindowKind, ProviderLimits } from "../../shared/api.ts";
import type { RawConfig, T3Port } from "../integrations/t3/schemas.ts";

// Short: T3 probes the providers itself, this only spares it repeated reads.
const CACHE_MS = 15_000;
const KINDS: readonly LimitWindowKind[] = ["session", "weekly", "monthly", "other"];

export interface ProviderLimitsOptions {
  port: Pick<T3Port, "getConfig" | "refreshProviders">;
  now: () => Date;
}

const isoOrNull = (value: string | null | undefined): string | null => (value && !Number.isNaN(Date.parse(value)) ? value : null);

/** The providers that report usable limit windows, in T3's order. */
export function toLimitsOverview(config: RawConfig, now: Date): LimitsOverview {
  const raw = config.providers ?? [];
  const providers: ProviderLimits[] = [];
  for (const provider of raw) {
    const limits = provider.usageLimits;
    if (provider.enabled === false || !limits) continue;
    const windows: LimitWindow[] = [];
    for (const window of limits.windows ?? []) {
      const used = window.usedPercent;
      if (typeof used !== "number" || !Number.isFinite(used)) continue;
      const minutes = window.windowDurationMins;
      windows.push({
        id: window.id,
        kind: KINDS.find((kind) => kind === window.kind) ?? "other",
        label: window.label ?? window.id,
        usedPercent: Math.min(100, Math.max(0, used)),
        resetsAt: isoOrNull(window.resetsAt),
        windowMinutes: typeof minutes === "number" && minutes > 0 ? minutes : null,
      });
    }
    if (windows.length === 0) continue;
    providers.push({
      instanceId: provider.instanceId,
      driver: provider.driver ?? provider.instanceId,
      name: provider.displayName ?? provider.instanceId,
      windows,
      resetCredits: Math.max(0, Math.floor(limits.resetCredits?.availableCount ?? 0)),
      checkedAt: limits.checkedAt ?? null,
    });
  }
  return { supported: raw.some((provider) => provider.usageLimits), providers, readAt: now.toISOString() };
}

/** The usage limits of the providers. It never waits behind the usage scan. */
export function createProviderLimits({ port, now }: ProviderLimitsOptions) {
  let cached: { at: number; overview: LimitsOverview } | null = null;
  let inFlight: Promise<LimitsOverview> | null = null;
  let refreshing: Promise<LimitsOverview> | null = null;

  const read = (): Promise<LimitsOverview> => {
    const pending = port
      .getConfig()
      .then((config) => {
        const overview = toLimitsOverview(config, now());
        cached = { at: now().getTime(), overview };
        return overview;
      })
      .finally(() => {
        inFlight = null;
      });
    inFlight = pending;
    return pending;
  };

  // T3 keeps its own check time per provider: only a probe moves it. A failed probe still lets the read run, so the card is not stale.
  const probeAndRead = async (): Promise<LimitsOverview> => {
    let failure: unknown = null;
    try {
      await port.refreshProviders();
    } catch (error) {
      failure = error;
    }
    const overview = await read();
    if (failure) throw failure;
    return overview;
  };

  return {
    /** `refresh` asks T3 to probe the providers again, then reads. Without it, a read in flight is joined. */
    async get(refresh: boolean): Promise<LimitsOverview> {
      if (refresh) {
        refreshing ??= probeAndRead().finally(() => {
          refreshing = null;
        });
        return refreshing;
      }
      if (inFlight) return inFlight;
      if (!refresh && cached && now().getTime() - cached.at < CACHE_MS) return cached.overview;
      return read();
    },
  };
}

export type ProviderLimitsReader = ReturnType<typeof createProviderLimits>;
