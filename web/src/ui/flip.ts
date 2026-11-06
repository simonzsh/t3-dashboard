export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Translate and scale (origin top left) that show an element laid out at `after` on `before`. */
export function flipDelta(before: Rect, after: Rect): { x: number; y: number; sx: number; sy: number } {
  return {
    x: before.left - after.left,
    y: before.top - after.top,
    sx: after.width > 0 ? before.width / after.width : 1,
    sy: after.height > 0 ? before.height / after.height : 1,
  };
}

// Sub-pixel changes come from rounding, not from a real layout change.
export function moved(a: Rect, b: Rect): boolean {
  return [a.left - b.left, a.top - b.top, a.width - b.width, a.height - b.height].some((d) => Math.abs(d) >= 1);
}

/** The box scaled down, same shape, to fit in `target` and centered on it. */
export function fitInto(box: Rect, target: Rect): Rect {
  const s = Math.min(target.width / box.width, target.height / box.height);
  const width = box.width * s;
  const height = box.height * s;
  return { left: target.left + (target.width - width) / 2, top: target.top + (target.height - height) / 2, width, height };
}

export type FlipStep = { id: string; kind: "move" | "enter" | "leave" };

export function flipPlan(before: Iterable<string>, after: Iterable<string>): FlipStep[] {
  const was = new Set(before);
  const is = new Set(after);
  const steps: FlipStep[] = [...is].map((id) => ({ id, kind: was.has(id) ? "move" : "enter" }));
  for (const id of was) if (!is.has(id)) steps.push({ id, kind: "leave" });
  return steps;
}
