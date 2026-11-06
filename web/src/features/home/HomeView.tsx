import { useState, type ReactNode } from "react";
import type { DashboardThread, UsageOverview } from "../../../../shared/api.ts";
import { agentCounts } from "../../lib/navBadges.ts";
import { relativeTime } from "../../lib/format.ts";
import { IconButton, Icon, Loader, Segmented } from "../../ui/index.ts";
import { UsageChart } from "./UsageChart.tsx";
import { cacheShare, delta, formatCompact, formatUsd, METRICS, type Metric } from "./usageView.ts";
import type { UsageState } from "./useUsage.ts";

interface TileProps {
  label: string;
  value: string;
  caption: string;
  /** The week-over-week change, shown beside the number. */
  change?: string | null;
}

function StatTile({ label, value, caption, change }: TileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {change && <span className={`stat-delta${change.startsWith("−") ? " down" : ""}`}>{change}</span>}
      </span>
      <span className="stat-caption">{caption}</span>
    </div>
  );
}

function Tiles({ usage, threads }: { usage: UsageOverview; threads: readonly DashboardThread[] }) {
  const { thisWeek, lastWeek, cost, total } = usage;
  const costKnown = cost.status !== "unavailable";
  const costCaption = cost.status === "unavailable" ? (cost.detail ?? "No usage reported by T3 Code") : cost.status === "partial" ? "some models unpriced · all usage on this machine" : "last 14 days · all usage on this machine";
  return (
    <div className="stat-tiles">
      <StatTile label="Turns · last 7 days" value={String(thisWeek.turns)} change={delta(thisWeek.turns, lastWeek.turns)} caption={usage.turnsPartial ? "T3 threads (partial)" : "T3 threads"} />
      <StatTile label="Sessions" value={String(usage.activeThreads)} caption={`${agentCounts(threads).running} running · last 14 days`} />
      <StatTile label="Spend (API equiv.)" value={costKnown ? formatUsd(total.costUsd) : "—"} caption={costCaption} />
    </div>
  );
}

function UsageCard({ state, threads, now }: { state: UsageState; threads: readonly DashboardThread[]; now: Date }) {
  const [metric, setMetric] = useState<Metric>("turns");
  const { usage, error, loading, refresh } = state;
  const costKnown = usage !== null && usage.cost.status !== "unavailable";
  return (
    <section className="home-card usage-card" aria-label="Usage">
      {!usage ? (
        error ? <p className="usage-error" role="alert">{error}</p> : <Loader />
      ) : (
        <>
          <Tiles usage={usage} threads={threads} />
          <div className="usage-chart-head">
            <h2>Last 14 days</h2>
            <Segmented label="Chart metric" value={metric} options={METRICS} onChange={setMetric} />
            <span className="usage-updated">Updated {relativeTime(usage.readAt, now)}</span>
            <IconButton size="sm" variant="ghost" label="Refresh usage" tooltip="Refresh usage" disabled={loading} onClick={refresh}>
              <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
            </IconButton>
          </div>
          {metric !== "turns" && !costKnown ? (
            <p className="usage-empty">{usage.cost.detail ?? "T3 Code sent no usage."}</p>
          ) : (
            <UsageChart days={usage.days} metric={metric} costKnown={costKnown} />
          )}
          {error && <p className="usage-error" role="alert">Could not refresh usage. {error}</p>}
        </>
      )}
    </section>
  );
}

function TodayCard({ usage }: { usage: UsageOverview }) {
  const today = usage.days.at(-1)!;
  const costKnown = usage.cost.status !== "unavailable";
  const cache = cacheShare(today);
  return (
    <section className="home-card small-card" aria-label="Today">
      <h2>Today</h2>
      <dl className="small-stats">
        <div><dt>Turns</dt><dd>{today.turns}</dd></div>
        <div><dt>Spend</dt><dd>{costKnown ? formatUsd(today.costUsd) : "—"}</dd></div>
        <div><dt>Tokens in → out</dt><dd>{costKnown ? `${formatCompact(today.inputTokens)} → ${formatCompact(today.outputTokens)}` : "—"}</dd></div>
        <div><dt>Cache</dt><dd>{costKnown && cache !== null ? `${cache} %` : "—"}</dd></div>
      </dl>
    </section>
  );
}

function NeedsYouCard({ threads, unread }: { threads: readonly DashboardThread[]; unread: number }) {
  const { waiting, running } = agentCounts(threads);
  return (
    <section className="home-card small-card" aria-label="Needs you">
      <h2>Needs you</h2>
      <dl className="small-stats">
        <div><dt>Waiting</dt><dd>{waiting}</dd></div>
        <div><dt>Running</dt><dd>{running}</dd></div>
        <div><dt>Unread</dt><dd>{unread}</dd></div>
      </dl>
    </section>
  );
}

interface Props {
  usage: UsageState;
  threads: readonly DashboardThread[];
  now: Date;
  unread: number;
  /** The Inbox: it keeps every one of its features below the usage cards. */
  children: ReactNode;
}

export function HomeView({ usage, threads, now, unread, children }: Props) {
  return (
    <div className="home">
      <UsageCard state={usage} threads={threads} now={now} />
      <div className="home-small-cards">
        {usage.usage && <TodayCard usage={usage.usage} />}
        <NeedsYouCard threads={threads} unread={unread} />
      </div>
      {children}
    </div>
  );
}
