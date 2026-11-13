import type { DragEvent } from "react";
import { Icon, IconButton } from "../../ui/index.ts";
import { CARD_TITLES, type CardWidth, type HomeCard } from "./layout.ts";

interface Props {
  card: HomeCard;
  width: CardWidth;
  canUp: boolean;
  canDown: boolean;
  onDragStart: (e: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onShift: (step: -1 | 1) => void;
  onWidth: () => void;
  onHide: () => void;
}

/** Edit mode: lies over the card's own header, which becomes the drag handle; the buttons cover keyboard and touch. */
export function CardEditBar({ card, width, canUp, canDown, onDragStart, onDragEnd, onShift, onWidth, onHide }: Props) {
  return (
    <div className="card-edit-bar" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} data-tooltip={`Drag to move ${CARD_TITLES[card]}`}>
      <span className="card-edit-buttons">
        <IconButton label={`Move ${CARD_TITLES[card]} up`} tooltip="Move up" size="sm" variant="ghost" disabled={!canUp} onClick={() => onShift(-1)}>
          <Icon name="arrowUp" />
        </IconButton>
        <IconButton label={`Move ${CARD_TITLES[card]} down`} tooltip="Move down" size="sm" variant="ghost" disabled={!canDown} onClick={() => onShift(1)}>
          <Icon name="arrowDown" />
        </IconButton>
        <IconButton label={`Make ${CARD_TITLES[card]} ${width === "half" ? "full" : "half"} width`} tooltip={width === "half" ? "Full width" : "Half width"} size="sm" variant="ghost" onClick={onWidth}>
          <Icon name={width === "half" ? "fullscreen" : "columns"} />
        </IconButton>
        <IconButton label={`Hide ${CARD_TITLES[card]}`} tooltip="Hide" size="sm" variant="ghost" onClick={onHide}>
          <Icon name="eyeOff" />
        </IconButton>
      </span>
    </div>
  );
}
