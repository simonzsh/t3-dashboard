import type { DragEvent } from "react";
import { Icon, IconButton } from "../../ui/index.ts";
import { CARD_TITLES, columnOf, type Column, type HomeCard, type HomeLayout } from "./layout.ts";

interface Props {
  card: HomeCard;
  layout: HomeLayout;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onShift: (step: -1 | 1) => void;
  onSwitch: () => void;
  onHide: () => void;
}

/** The bar above a card in edit mode: a drag handle, and buttons for what a mouse drag cannot do (keyboard, touch). */
export function CardEditBar({ card, layout, onDragStart, onDragEnd, onShift, onSwitch, onHide }: Props) {
  const column = columnOf(layout, card) as Column;
  const at = layout[column].indexOf(card);
  const other = column === "left" ? "right" : "left";
  return (
    <div className="card-edit-bar">
      <span className="card-handle" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} data-tooltip="Drag to move">
        <Icon name="grip" />
      </span>
      <span className="card-edit-title">{CARD_TITLES[card]}</span>
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
    </div>
  );
}
