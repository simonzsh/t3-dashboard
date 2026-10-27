export type Swipe = "left" | "right";

const MIN_DISTANCE = 60;

/** A horizontal swipe, or null for a tap, a short drag or a mostly vertical scroll. */
export function swipeDirection(dx: number, dy: number): Swipe | null {
  if (Math.abs(dx) < MIN_DISTANCE || Math.abs(dx) < Math.abs(dy) * 1.5) return null;
  return dx < 0 ? "left" : "right";
}
