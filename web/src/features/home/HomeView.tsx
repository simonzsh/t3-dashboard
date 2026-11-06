import { useState, type CSSProperties, type ReactNode } from "react";
import type { DashboardThread, UsageOverview } from "../../../../shared/api.ts";
import { agentCounts } from "../../lib/navBadges.ts";
import { stackedOrder, type HomeCard, type HomeLayout } from "./layout.ts";
import { relativeTime } from "../../lib/format.ts";
import { IconButton, Icon, Loader, Segmented } from "../../ui/index.ts";
import { UsageChart } from "./UsageChart.tsx";
import { delta, formatUsd, METRICS, type Metric } from "./usageView.ts";
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
  const { thisWeek, lastWeek, cost, sessions } = usage;
  const costKnown = cost.status !== "unavailable";
  const costCaption = !costKnown ? (cost.detail ?? "No usage reported by T3 Code") : cost.status === "partial" ? "last 7 days · some models unpriced · all usage on this machine" : "last 7 days · all usage on this machine";
  // A turn is one agent run: each message sent to an agent, by you or by an automation.
  const turnsCaption = `messages sent to agents · last 7 days${usage.turnsPartial ? " (partial)" : ""}`;
  return (
    <div className="stat-tiles">
      <StatTile label="Turns" value={String(thisWeek.turns)} change={delta(thisWeek.turns, lastWeek.turns)} caption={turnsCaption} />
      <StatTile label="Sessions" value={String(sessions.thisWeek)} change={delta(sessions.thisWeek, sessions.lastWeek)} caption={`${agentCounts(threads).running} running · last 7 days`} />
      <StatTile label="Spend (API equiv.)" value={costKnown ? formatUsd(thisWeek.costUsd) : "—"} change={costKnown ? delta(thisWeek.costUsd, lastWeek.costUsd) : null} caption={costCaption} />
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

export interface HomeCards {
  notifications: ReactNode;
  running: ReactNode;
  "up-next": ReactNode;
}

interface Props {
  usage: UsageState;
  threads: readonly DashboardThread[];
  now: Date;
  layout: HomeLayout;
  /** The cards of the Inbox: the Home layout places them. */
  cards: HomeCards;
}

export function HomeView({ usage, threads, now, layout, cards }: Props) {
  const body: Record<HomeCard, ReactNode> = { usage: <UsageCard state={usage} threads={threads} now={now} />, ...cards };
  const order = stackedOrder(layout);
  const column = (id: "left" | "right") => (
    <div className={`home-col ${id}`}>
      {layout[id].map((card) => (
        <div key={card} className={`home-slot ${card}`} style={{ "--stack": order.indexOf(card) } as CSSProperties}>
          {body[card]}
        </div>
      ))}
    </div>
  );
  return (
    <div className="home">
      {column("left")}
      {column("right")}
    </div>
  );
}
