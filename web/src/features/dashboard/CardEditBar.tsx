import type { DragEvent } from "react";
import { Icon, IconButton } from "../../ui/index.ts";
import { CARD_TITLES, columnOf, type Column, type DashboardCard, type DashboardLayout } from "./layout.ts";

interface Props {
  card: DashboardCard;
  layout: DashboardLayout;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onShift: (step: -1 | 1) => void;
  onSwitch: () => void;
  onHide: () => void;
}

/** Edit mode: lies over the card's own header, which becomes the drag handle; the buttons cover keyboard and touch. */
export function CardEditBar({ card, layout, onDragStart, onDragEnd, onShift, onSwitch, onHide }: Props) {
  const column = columnOf(layout, card) as Column;
  const at = layout[column].indexOf(card);
  const other = column === "left" ? "right" : "left";
  return (
    <div className="card-edit-bar" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} data-tooltip={`Drag to move ${CARD_TITLES[card]}`}>
      <span className="card-edit-buttons">
      <IconButton label={`Move ${CARD_TITLES[card]} up`} tooltip="Move up" size="sm" variant="ghost" disabled={at === 0} onClick={() => onShift(-1)}>
        <Icon name="arrowUp" />
      </IconButton>
      <IconButton label={`Move ${CARD_TITLES[card]} down`} tooltip="Move down" size="sm" variant="ghost" disabled={at === layout[column].length - 1} onClick={() => onShift(1)}>
        <Icon name="arrowDown" />
      </IconButton>
      <IconButton label={`Move ${CARD_TITLES[card]} to the ${other} column`} tooltip={`Move to the ${other} column`} size="sm" variant="ghost" onClick={onSwitch}>
        <Icon name={other === "left" ? "arrowLeft" : "arrowRight"} />
      </IconButton>
      <IconButton label={`Hide ${CARD_TITLES[card]}`} tooltip="Hide" size="sm" variant="ghost" onClick={onHide}>
        <Icon name="eyeOff" />
      </IconButton>
      </span>
    </div>
  );
}
