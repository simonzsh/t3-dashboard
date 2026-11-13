import { useState, type ReactNode } from "react";
import type { ActivityPeriod, UsageOverview } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { CardHead, Dropdown, Icon, IconButton, Segmented, Skeleton, SkeletonGroup } from "../../ui/index.ts";
import { ActivityChart } from "./ActivityChart.tsx";
import { PERIOD_OPTIONS } from "./activityPeriod.ts";
import { chartBars, chartTitle, delta, formatUsd, METRICS, type Metric } from "./activityView.ts";
import type { ActivityState } from "./useActivity.ts";

interface TileProps {
  label: ReactNode;
  value: string;
  caption: ReactNode;
  /** The change from the previous period, shown beside the number. */
  change?: string | null;
}

function StatTile({ label, value, caption, change }: TileProps) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {change && <span className={`stat-delta${change.startsWith("−") ? " down" : change === "0 %" ? " flat" : ""}`}>{change}</span>}
      </span>
      <span className="stat-caption">{caption}</span>
    </div>
  );
}

function Tiles({ usage, costKnown }: { usage: UsageOverview; costKnown: boolean }) {
  const { current, previous, cost, sessions } = usage;
  // On a phone the tiles show only the short part; `.stat-more` holds the rest.
  const more = (text: string) => <span className="stat-more">{text}</span>;
  const costCaption = !costKnown ? (cost.detail ?? "No usage reported by T3 Code") : cost.status === "partial" ? "some models unpriced · all usage on this machine" : "all usage on this machine";
  // A turn is one agent run: each message sent to an agent, by you or by an automation.
  const turnsCaption = `messages sent to agents${usage.turnsPartial ? " (partial)" : ""}`;
  return (
    <div className="stat-tiles">
      <StatTile label="Turns" value={String(current.turns)} change={delta(current.turns, previous.turns)} caption={turnsCaption} />
      <StatTile label="Sessions" value={String(sessions.current)} change={delta(sessions.current, sessions.previous)} caption="conversations with at least one turn" />
      <StatTile label={<>Spend{more(" (API equiv.)")}</>} value={costKnown ? formatUsd(current.costUsd) : "—"} change={costKnown ? delta(current.costUsd, previous.costUsd) : null} caption={costCaption} />
    </div>
  );
}

const BAR_HEIGHTS = [40, 62, 35, 78, 55, 90, 48, 70, 30, 85, 60, 45, 72, 52];

// Same footprint as the tiles and the chart, so the card keeps its height.
function ActivitySkeleton() {
  return (
    <SkeletonGroup label="Loading activity">
      <div className="stat-tiles">
        {[0, 1, 2].map((i) => (
          <div className="stat-tile" key={i}>
            <Skeleton height={12} width="45%" />
            <div className="stat-skeleton-value"><Skeleton height="100%" width="55%" /></div>
            <Skeleton height={12} width="80%" />
          </div>
        ))}
      </div>
      <div className="activity-chart-head">
        <Skeleton height={13} width={96} />
        <Skeleton height={28} width={150} radius={8} />
      </div>
      <div className="skeleton-bars">
        {BAR_HEIGHTS.map((h, i) => (
          <Skeleton key={i} height={`${h}%`} radius="4px 4px 0 0" />
        ))}
      </div>
    </SkeletonGroup>
  );
}

export function ActivityCard({ state, now }: { state: ActivityState; now: Date }) {
  const [metric, setMetric] = useState<Metric>("turns");
  const { period, setPeriod, error, loading, refresh } = state;
  // The previous period's numbers never sit under the new label while its read is on the way.
  const usage = state.value?.period === period ? state.value : null;
  const costKnown = usage !== null && usage.cost.status !== "unavailable";
  return (
    <section className="card activity-card" aria-labelledby="home-activity-head">
      <CardHead
        id="home-activity-head"
        icon="chart"
        title="Activity"
        note={<Dropdown label="Activity period" value={String(period)} options={PERIOD_OPTIONS} onPick={(id) => setPeriod(Number(id) as ActivityPeriod)} />}
        actions={
          <>
            {usage && <span className="card-updated">Updated {relativeTime(usage.readAt, now)}</span>}
            <IconButton size="sm" variant="ghost" label="Refresh activity" tooltip="Refresh activity" disabled={loading} aria-busy={loading} onClick={refresh}>
              <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
            </IconButton>
          </>
        }
      />
      {!usage ? (
        error ? <p className="card-message error" role="alert">{error}</p> : <ActivitySkeleton />
      ) : (
        <>
          <Tiles usage={usage} costKnown={costKnown} />
          <div className="activity-chart-head">
            <h2>{chartTitle(period)}</h2>
            <Segmented label="Chart metric" value={metric} options={METRICS} onChange={setMetric} />
          </div>
          {metric !== "turns" && !costKnown ? (
            <p className="card-message">{usage.cost.detail ?? "T3 Code sent no usage."}</p>
          ) : (
            <ActivityChart bars={chartBars(usage.days, period)} weekly={period === 90} metric={metric} costKnown={costKnown} />
          )}
          {error && <p className="card-message error" role="alert">Could not refresh activity. {error}</p>}
        </>
      )}
    </section>
  );
}
