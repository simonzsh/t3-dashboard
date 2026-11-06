import type { DragEvent } from "react";
import { Icon, IconButton } from "../../ui/index.ts";
import { CARD_TITLES, type DashboardCard } from "./layout.ts";

interface Props {
  card: DashboardCard;
  /** Place of the card in the order, and the number of shown cards. */
  index: number;
  count: number;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onShift: (step: -1 | 1) => void;
  onHide: () => void;
}

/** Edit mode: lies over the card's own header, which becomes the drag handle; the buttons cover keyboard and touch. */
export function CardEditBar({ card, index, count, onDragStart, onDragEnd, onShift, onHide }: Props) {
  return (
    <div className="card-edit-bar" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} data-tooltip={`Drag to move ${CARD_TITLES[card]}`}>
      <span className="card-edit-buttons">
        <IconButton label={`Move ${CARD_TITLES[card]} up`} tooltip="Move up" size="sm" variant="ghost" disabled={index === 0} onClick={() => onShift(-1)}>
          <Icon name="arrowUp" />
        </IconButton>
        <IconButton label={`Move ${CARD_TITLES[card]} down`} tooltip="Move down" size="sm" variant="ghost" disabled={index === count - 1} onClick={() => onShift(1)}>
          <Icon name="arrowDown" />
        </IconButton>
        <IconButton label={`Hide ${CARD_TITLES[card]}`} tooltip="Hide" size="sm" variant="ghost" onClick={onHide}>
          <Icon name="eyeOff" />
        </IconButton>
      </span>
    </div>
  );
}
