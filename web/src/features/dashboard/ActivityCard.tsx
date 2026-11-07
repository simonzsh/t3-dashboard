import { useState, type ReactNode } from "react";
import type { UsageOverview } from "../../../../shared/api.ts";
import { relativeTime } from "../../lib/format.ts";
import { CardHead, Icon, IconButton, Segmented, Skeleton, SkeletonGroup } from "../../ui/index.ts";
import { ActivityChart } from "./ActivityChart.tsx";
import { delta, formatUsd, METRICS, type Metric } from "./activityView.ts";
import type { ReadState } from "./pollRead.ts";

interface TileProps {
  label: ReactNode;
  value: string;
  caption: ReactNode;
  /** The week-over-week change, shown beside the number. */
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
  const { thisWeek, lastWeek, cost, sessions } = usage;
  // On a phone the tiles show only the short part; `.stat-more` holds the rest.
  const more = (text: string) => <span className="stat-more">{text}</span>;
  const costCaption = !costKnown ? (cost.detail ?? "No usage reported by T3 Code") : cost.status === "partial" ? "some models unpriced · all usage on this machine" : "all usage on this machine";
  // A turn is one agent run: each message sent to an agent, by you or by an automation.
  const turnsCaption = `messages sent to agents${usage.turnsPartial ? " (partial)" : ""}`;
  return (
    <div className="stat-tiles">
      <StatTile label="Turns" value={String(thisWeek.turns)} change={delta(thisWeek.turns, lastWeek.turns)} caption={turnsCaption} />
      <StatTile label="Sessions" value={String(sessions.thisWeek)} change={delta(sessions.thisWeek, sessions.lastWeek)} caption="conversations with at least one turn" />
      <StatTile label={<>Spend{more(" (API equiv.)")}</>} value={costKnown ? formatUsd(thisWeek.costUsd) : "—"} change={costKnown ? delta(thisWeek.costUsd, lastWeek.costUsd) : null} caption={costCaption} />
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

export function ActivityCard({ state, now }: { state: ReadState<UsageOverview>; now: Date }) {
  const [metric, setMetric] = useState<Metric>("turns");
  const { value: usage, error, loading, refresh } = state;
  const costKnown = usage !== null && usage.cost.status !== "unavailable";
  return (
    <section className="dashboard-card activity-card" aria-labelledby="dashboard-activity-head">
      <CardHead
        id="dashboard-activity-head"
        icon="chart"
        title="Activity"
        note="last 7 days"
        actions={
          <>
            {usage && <span className="card-updated">Updated {relativeTime(usage.readAt, now)}</span>}
            <IconButton size="sm" variant="ghost" label="Refresh activity" tooltip="Refresh activity" disabled={loading} onClick={refresh}>
              <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
            </IconButton>
          </>
        }
      />
      {!usage ? (
        error ? <p className="dashboard-note error" role="alert">{error}</p> : <ActivitySkeleton />
      ) : (
        <>
          <Tiles usage={usage} costKnown={costKnown} />
          <div className="activity-chart-head">
            <h2>Last 14 days</h2>
            <Segmented label="Chart metric" value={metric} options={METRICS} onChange={setMetric} />
          </div>
          {metric !== "turns" && !costKnown ? (
            <p className="dashboard-note">{usage.cost.detail ?? "T3 Code sent no usage."}</p>
          ) : (
            <ActivityChart days={usage.days} metric={metric} costKnown={costKnown} />
          )}
          {error && <p className="dashboard-note error" role="alert">Could not refresh activity. {error}</p>}
        </>
      )}
    </section>
  );
}
