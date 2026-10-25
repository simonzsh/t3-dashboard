export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const GAP = 8;
const MARGIN = 4;

/** Centered above the anchor, below when the top has no room, always inside the viewport. */
export function placeTooltip(anchor: Box, tip: Pick<Box, "width" | "height">, viewport: Pick<Box, "width" | "height">): { left: number; top: number } {
  const centered = anchor.left + anchor.width / 2 - tip.width / 2;
  const left = Math.max(MARGIN, Math.min(centered, viewport.width - tip.width - MARGIN));
  const above = anchor.top - GAP - tip.height;
  const top = above >= MARGIN ? above : anchor.top + anchor.height + GAP;
  return { left, top };
}
