import type { LimitsOverview, ServerStats, UsageOverview } from "../../../../shared/api.ts";
import { Fragment, useRef, useState, type DragEvent, type ReactNode } from "react";
import { CardEditBar } from "./CardEditBar.tsx";
import { CARD_TITLES, dropCard, layoutRows, resolveDrop, setHidden, shiftCard, toggleWidth, type CardColumn, type DashboardCard, type DashboardLayout, type DropTarget } from "./layout.ts";
import { Button, Icon, Sheet, useFlip } from "../../ui/index.ts";
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
  const [target, setTarget] = useState<DropTarget | null>(null);
  const [dragHeight, setDragHeight] = useState(0);
  // A hidden Up next reads no tickets.
  const { notifications, ...cards } = useDashboardCards(input, !layout.hidden.includes("up-next"));
  const body: Record<DashboardCard, ReactNode> = { usage: <UsageCard state={limits} now={input.now} />, server: <ServerCard state={server} />, activity: <ActivityCard state={activity} running={running} now={input.now} />, ...cards };
  const showPanel = panelOpen && !editing;
  // The sheet takes no room, so the cards do not move for it.
  const inline = showPanel && !sheet;
  const root = useRef<HTMLDivElement>(null);
  // Cards slide to their new place when the panel shows or hides, or the layout changes. Not gated on the drag:
  // a drop ends the drag in the same render, and a gate would skip the slide of that drop.
  useFlip(root, `${inline}|${layout.order.map((p) => `${p.id}:${p.width}:${p.column}`).join(",")}`, { item: "data-dash-item" });
  const endDrag = () => {
    setDragged(null);
    setTarget(null);
  };
  const draggedWidth = layout.order.find((p) => p.id === dragged)?.width;
  const aim = (e: DragEvent, t: DropTarget) => {
    if (!dragged) return;
    e.preventDefault();
    const next = resolveDrop(layout, dragged, t);
    setTarget((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    if (dragged && target) onLayout(dropCard(layout, dragged, target));
    endDrag();
  };
  // No placeholder where the card already is: dropping there changes nothing.
  const dropping = dragged !== null && target !== null && dropCard(layout, dragged, target) !== layout;
  const dropBox = <div className="dashboard-drop" style={{ height: dragHeight }} aria-hidden="true" />;
  const columnDrop = (row: number, column: CardColumn, index: number) => dropping && target?.kind === "column" && target.row === row && target.column === column && target.index === index && dropBox;
  const gapDrop = (row: number) =>
    dropping &&
    target?.kind === "gap" &&
    target.row === row &&
    (draggedWidth === "full" ? (
      dropBox
    ) : (
      <div className="dashboard-band">
        <div className="dashboard-col left">{target.column === "left" && dropBox}</div>
        <div className="dashboard-col right">{target.column === "right" && dropBox}</div>
      </div>
    ));
  const slot = (card: DashboardCard, full: boolean) => (
    <div data-dash-item={card} data-dash-row={full ? "" : undefined} className={`dashboard-slot ${card}${dragged === card ? " dragging" : ""}`}>
      {editing && (
        <CardEditBar
          card={card}
          width={layout.order.find((p) => p.id === card)?.width ?? "half"}
          canUp={shiftCard(layout, card, -1) !== layout}
          canDown={shiftCard(layout, card, 1) !== layout}
          onDragStart={(e) => {
            setDragged(card);
            e.dataTransfer.effectAllowed = "move";
            const el = e.currentTarget.closest(".dashboard-slot");
            if (el) {
              e.dataTransfer.setDragImage(el, 16, 16);
              setDragHeight(Math.min(el.getBoundingClientRect().height, 240));
            }
          }}
          onDragEnd={endDrag}
          onShift={(step) => onLayout(shiftCard(layout, card, step))}
          onWidth={() => onLayout(toggleWidth(layout, card))}
          onHide={() => onLayout(setHidden(layout, card, true))}
        />
      )}
      <div className="dashboard-slot-body" inert={editing}>
        {body[card]}
      </div>
    </div>
  );
  const column = (row: number, side: CardColumn, stack: DashboardCard[]) => (
    <div className={`dashboard-col ${side}`}>
      {stack.map((card, index) => (
        <Fragment key={card}>
          {columnDrop(row, side, index)}
          {slot(card, false)}
        </Fragment>
      ))}
      {columnDrop(row, side, stack.length)}
    </div>
  );
  const rows = layoutRows(layout);
  // One handler for the whole grid: the pointer is matched against the real rows and slots, so gaps and placeholders never make the target jump.
  const aimAt = (e: DragEvent<HTMLElement>) => {
    if (!dragged) return;
    const grid = e.currentTarget;
    const y = e.clientY;
    const half = draggedWidth === "half";
    const mid = (el: Element | null) => {
      const box = el?.getBoundingClientRect();
      return box ? box.top + box.height / 2 : Infinity;
    };
    const slotOf = (card: DashboardCard) => grid.querySelector(`[data-dash-item="${card}"]`);
    const els = [...grid.querySelectorAll(":scope > [data-dash-row]")];
    // Below 900 px a band has no box (display: contents): the cards read band by band, left stack then right.
    if (els.some((el) => getComputedStyle(el).display === "contents")) {
      for (const [r, row] of rows.entries()) {
        if (row.kind === "full") {
          if (mid(slotOf(row.card)) > y) return aim(e, { kind: "gap", row: r, column: "right" });
          continue;
        }
        for (const [side, stack] of [["left", row.left], ["right", row.right]] as const) {
          const i = stack.findIndex((card) => mid(slotOf(card)) > y);
          if (i === -1) continue;
          if (half) return aim(e, { kind: "column", row: r, column: side, index: i });
          return aim(e, { kind: "gap", row: side === "left" && i === 0 ? r : r + 1, column: "right" });
        }
      }
      return aim(e, { kind: "gap", row: rows.length, column: "right" });
    }
    const box = grid.getBoundingClientRect();
    const gapColumn: CardColumn = e.clientX < box.left + box.width / 2 ? "left" : "right";
    for (const [r, el] of els.entries()) {
      const row = rows[r];
      const band = el.getBoundingClientRect();
      if (row?.kind === "band" && half && y >= band.top && y <= band.bottom) {
        const side: CardColumn = e.clientX < band.left + band.width / 2 ? "left" : "right";
        const stack = side === "left" ? row.left : row.right;
        return aim(e, { kind: "column", row: r, column: side, index: stack.filter((card) => mid(slotOf(card)) < y).length });
      }
      if (y < band.top + band.height / 2) return aim(e, { kind: "gap", row: r, column: gapColumn });
    }
    aim(e, { kind: "gap", row: rows.length, column: gapColumn });
  };
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
        <div
          className={`dashboard-cards${editing ? " editing" : ""}`}
          onDragOver={editing ? aimAt : undefined}
          onDrop={editing ? drop : undefined}
        >
          {rows.map((row, r) => (
            <Fragment key={row.kind === "full" ? row.card : `band:${r}`}>
              {gapDrop(r)}
              {row.kind === "full" ? (
                slot(row.card, true)
              ) : (
                <div className="dashboard-band" data-dash-row="">
                  {column(r, "left", row.left)}
                  {column(r, "right", row.right)}
                </div>
              )}
            </Fragment>
          ))}
          {gapDrop(rows.length)}
        </div>
      </div>
      {sheet && !editing ? (
        <Sheet open={showPanel} label="Notifications" width="narrow" onClose={onCloseSheet}>
          {notifications}
        </Sheet>
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
