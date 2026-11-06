import { Fragment, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import type { DashboardThread, UsageOverview } from "../../../../shared/api.ts";
import { agentCounts } from "../../lib/navBadges.ts";
import { CardEditBar } from "./CardEditBar.tsx";
import { CARD_TITLES, dropCard, moveCard, setHidden, shiftCard, stackedOrder, type Column, type DashboardCard, type DashboardLayout } from "./layout.ts";
import { relativeTime } from "../../lib/format.ts";
import { Button, IconButton, Icon, Loader, Segmented } from "../../ui/index.ts";
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
    <section className="dashboard-card usage-card" aria-labelledby="dashboard-usage-head">
      {/* Same look as the other cards' CardHead: features cannot share components. */}
      <div className="card-head">
        <Icon name="chart" />
        <h2 id="dashboard-usage-head">Usage</h2>
        <span className="card-actions">
          {usage && <span className="usage-updated">Updated {relativeTime(usage.readAt, now)}</span>}
          <IconButton size="sm" variant="ghost" label="Refresh usage" tooltip="Refresh usage" disabled={loading} onClick={refresh}>
            <Icon name="refresh" className={loading ? "icon spinning" : "icon"} />
          </IconButton>
        </span>
      </div>
      {!usage ? (
        error ? <p className="usage-error" role="alert">{error}</p> : <Loader />
      ) : (
        <>
          <Tiles usage={usage} threads={threads} />
          <div className="usage-chart-head">
            <h2>Last 14 days</h2>
            <Segmented label="Chart metric" value={metric} options={METRICS} onChange={setMetric} />
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

export interface DashboardCards {
  notifications: ReactNode;
  running: ReactNode;
  "up-next": ReactNode;
}

interface Props {
  usage: UsageState;
  threads: readonly DashboardThread[];
  now: Date;
  layout: DashboardLayout;
  /** The cards of the Inbox: the Dashboard layout places them. */
  cards: DashboardCards;
  /** Edit mode: each card gets a bar to move or hide it. */
  editing?: boolean;
  onLayout?: (layout: DashboardLayout) => void;
}

export function DashboardView({ usage, threads, now, layout, cards, editing = false, onLayout = () => {} }: Props) {
  const [dragged, setDragged] = useState<DashboardCard | null>(null);
  // Where the dragged card would land, shown as a placeholder of its size.
  const [target, setTarget] = useState<{ column: Column; index: number } | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  const body: Record<DashboardCard, ReactNode> = { usage: <UsageCard state={usage} threads={threads} now={now} />, ...cards };
  const order = stackedOrder(layout);
  const endDrag = () => {
    setDragged(null);
    setTarget(null);
  };
  const aim = (e: DragEvent, column: Column, index: number) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
    if (target?.column !== column || target.index !== index) setTarget({ column, index });
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragged && target) {
      onLayout(dropCard(layout, dragged, target.column, target.index));
    }
    endDrag();
  };
  // No placeholder where the card already is: dropping there changes nothing.
  const showsDrop = (column: Column, index: number) =>
    dragged !== null && target?.column === column && target.index === index && dropCard(layout, dragged, column, index) !== layout;
  const placeholder = (column: Column, index: number) =>
    showsDrop(column, index) && dragged && (
      <div className={`dashboard-drop ${dragged}`} style={{ height: dragHeight }} aria-hidden="true" onDragOver={(e) => aim(e, column, index)} onDrop={drop} />
    );
  const column = (id: Column) => (
    <div
      className={`dashboard-col ${id}${editing ? " editing" : ""}${id === "right" && layout.right.length === 1 && layout.right[0] === "notifications" ? " pinned" : ""}`}
      onDragOver={editing ? (e) => aim(e, id, layout[id].length) : undefined}
      onDrop={editing ? drop : undefined}
    >
      {layout[id].map((card, index) => (
        <Fragment key={card}>
          {placeholder(id, index)}
          <div
          key={card}
          className={`dashboard-slot ${card}${dragged === card ? " dragging" : ""}`}
          style={{ "--stack": order.indexOf(card) } as CSSProperties}
          onDragOver={editing ? (e) => aim(e, id, index) : undefined}
          onDrop={editing ? drop : undefined}
        >
          {editing && (
            <CardEditBar
              card={card}
              layout={layout}
              onDragStart={(e) => {
                setDragged(card);
                e.dataTransfer.effectAllowed = "move";
                const slot = e.currentTarget.closest(".dashboard-slot");
                if (slot) {
                  e.dataTransfer.setDragImage(slot, 16, 16);
                  setDragHeight(Math.min(slot.getBoundingClientRect().height, 240));
                }
              }}
              onDragEnd={endDrag}
              onShift={(step) => onLayout(shiftCard(layout, card, step))}
              onSwitch={() => onLayout(moveCard(layout, card, id === "left" ? "right" : "left"))}
              onHide={() => onLayout(setHidden(layout, card, true))}
            />
          )}
          <div className="dashboard-slot-body" inert={editing}>
            {body[card]}
          </div>
        </div>
        </Fragment>
      ))}
      {placeholder(id, layout[id].length)}
    </div>
  );
  return (
    <div className="dashboard">
      {editing && layout.hidden.length > 0 && (
        <div className="dashboard-hidden">
          <span>Hidden cards</span>
          {layout.hidden.map((card) => (
            <Button key={card} size="sm" onClick={() => onLayout(setHidden(layout, card, false))}>
              <Icon name="eye" /> Show {CARD_TITLES[card]}
            </Button>
          ))}
        </div>
      )}
      {column("left")}
      {column("right")}
    </div>
  );
}
