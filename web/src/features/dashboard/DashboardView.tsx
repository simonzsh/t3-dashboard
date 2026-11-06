import type { LimitsOverview, UsageOverview } from "../../../../shared/api.ts";
import { Fragment, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { CardEditBar } from "./CardEditBar.tsx";
import { CARD_TITLES, dropCard, moveCard, setHidden, shiftCard, stackedOrder, type Column, type DashboardCard, type DashboardLayout } from "./layout.ts";
import { Button, Icon } from "../../ui/index.ts";
import { ActivityCard } from "./ActivityCard.tsx";
import { UsageCard } from "./UsageCard.tsx";
import { useDashboardCards, type CardsInput } from "./useDashboardCards.tsx";
import type { ReadState } from "./pollRead.ts";

interface Props extends CardsInput {
  limits: ReadState<LimitsOverview>;
  activity: ReadState<UsageOverview>;
  /** Agents at work among the listed threads: the same count as the Sessions badge and the Running card. */
  running: number;
  layout: DashboardLayout;
  /** Edit mode: each card gets a bar to move or hide it. */
  editing: boolean;
  onLayout: (layout: DashboardLayout) => void;
}

export function DashboardView({ limits, activity, running, layout, editing, onLayout, ...input }: Props) {
  const [dragged, setDragged] = useState<DashboardCard | null>(null);
  // Where the dragged card would land, shown as a placeholder of its size.
  const [target, setTarget] = useState<{ column: Column; index: number } | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  const cards = useDashboardCards(input);
  const body: Record<DashboardCard, ReactNode> = { usage: <UsageCard state={limits} now={input.now} />, activity: <ActivityCard state={activity} running={running} now={input.now} />, ...cards };
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
    if (dragged && target) onLayout(dropCard(layout, dragged, target.column, target.index));
    endDrag();
  };
  // No placeholder where the card already is: dropping there changes nothing.
  const placeholder = (column: Column, index: number) =>
    dragged &&
    target?.column === column &&
    target.index === index &&
    dropCard(layout, dragged, column, index) !== layout && (
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
            className={`dashboard-slot ${card}${dragged === card ? " dragging" : ""}`}
            style={{ "--stack": order.indexOf(card) } as CSSProperties}
            onDragOver={editing ? (e) => aim(e, id, index) : undefined}
            onDrop={editing ? drop : undefined}
          >
            {editing && (
              <CardEditBar
                card={card}
                column={id}
                index={index}
                count={layout[id].length}
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
