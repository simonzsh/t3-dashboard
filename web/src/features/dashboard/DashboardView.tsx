import type { LimitsOverview, ServerStats, UsageOverview } from "../../../../shared/api.ts";
import { Fragment, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CardEditBar } from "./CardEditBar.tsx";
import { CARD_TITLES, dropCard, setHidden, shiftCard, type DashboardCard, type DashboardLayout } from "./layout.ts";
import { Button, Icon, useFlip } from "../../ui/index.ts";
import { ActivityCard } from "./ActivityCard.tsx";
import { ServerCard } from "./ServerCard.tsx";
import { UsageCard } from "./UsageCard.tsx";
import { useDashboardCards, type CardsInput } from "./useDashboardCards.tsx";
import type { ReadState } from "./pollRead.ts";

interface Props extends CardsInput {
  limits: ReadState<LimitsOverview>;
  server: ReadState<ServerStats>;
  activity: ReadState<UsageOverview>;
  /** Agents at work among the listed threads: the same count as the Sessions badge and the Running card. */
  running: number;
  layout: DashboardLayout;
  /** Edit mode: each card gets a bar to move or hide it. */
  editing: boolean;
  onLayout: (layout: DashboardLayout) => void;
  /** The Notifications panel is open; edit mode hides it anyway. */
  panelOpen: boolean;
  /** Sheet mode: the panel is a side sheet over the page, and a tap on the backdrop closes it. */
  sheet: boolean;
  onCloseSheet: () => void;
}

export function DashboardView({ limits, server, activity, running, layout, editing, onLayout, panelOpen, sheet, onCloseSheet, ...input }: Props) {
  const [dragged, setDragged] = useState<DashboardCard | null>(null);
  // Where the dragged card would land, shown as a placeholder of its size.
  const [target, setTarget] = useState<number | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  // A hidden Up next reads no tickets.
  const { notifications, ...cards } = useDashboardCards(input, !layout.hidden.includes("up-next"));
  const body: Record<DashboardCard, ReactNode> = { usage: <UsageCard state={limits} now={input.now} />, server: <ServerCard state={server} />, activity: <ActivityCard state={activity} running={running} now={input.now} />, ...cards };
  const showPanel = panelOpen && !editing;
  // The sheet takes no room, so the cards do not move for it.
  const inline = showPanel && !sheet;
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (sheet && showPanel) panel.current?.focus();
  }, [sheet, showPanel]);
  // Cards slide to their new place when the panel shows or hides, or the order changes; not while dragging.
  useFlip(root, `${inline}|${layout.order.join(",")}`, { item: "data-dash-item", enabled: dragged === null });
  const endDrag = () => {
    setDragged(null);
    setTarget(null);
  };
  const aim = (e: DragEvent, index: number) => {
    if (!dragged) return;
    e.preventDefault();
    e.stopPropagation();
    if (target !== index) setTarget(index);
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragged && target !== null) onLayout(dropCard(layout, dragged, target));
    endDrag();
  };
  // No placeholder where the card already is: dropping there changes nothing.
  const placeholder = (index: number) =>
    dragged &&
    target === index &&
    dropCard(layout, dragged, index) !== layout && (
      <div className={`dashboard-drop ${dragged}`} style={{ height: dragHeight }} aria-hidden="true" onDragOver={(e) => aim(e, index)} onDrop={drop} />
    );
  return (
    <div ref={root} className={`dashboard${inline ? " with-panel" : ""}`}>
      <div className="dashboard-main">
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
        <div className={`dashboard-cards${editing ? " editing" : ""}`} onDragOver={editing ? (e) => aim(e, layout.order.length) : undefined} onDrop={editing ? drop : undefined}>
          {layout.order.map((card, index) => (
            <Fragment key={card}>
              {placeholder(index)}
              <div data-dash-item={card} className={`dashboard-slot ${card}${dragged === card ? " dragging" : ""}`} onDragOver={editing ? (e) => aim(e, index) : undefined} onDrop={editing ? drop : undefined}>
                {editing && (
                  <CardEditBar
                    card={card}
                    index={index}
                    count={layout.order.length}
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
                    onHide={() => onLayout(setHidden(layout, card, true))}
                  />
                )}
                <div className="dashboard-slot-body" inert={editing}>
                  {body[card]}
                </div>
              </div>
            </Fragment>
          ))}
          {placeholder(layout.order.length)}
        </div>
      </div>
      {sheet && !editing && <div className={`dashboard-backdrop${showPanel ? " open" : ""}`} aria-hidden="true" onClick={onCloseSheet} />}
      {sheet && !editing ? (
        <aside ref={panel} tabIndex={-1} className={`dashboard-panel${showPanel ? " open" : ""}`} role="dialog" aria-modal="true" aria-label="Notifications" inert={!showPanel}>
          {notifications}
        </aside>
      ) : (
        inline && (
          <aside data-dash-item="notifications" className="dashboard-panel" aria-label="Notifications">
            {notifications}
          </aside>
        )
      )}
    </div>
  );
}
