import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { fitInto, flipDelta, flipPlan, moved, type Rect } from "./flip.ts";

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
// Overshoots a little: the light bounce at the end of a move.
const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const SHORT = 160;
const BASE = 240;
const LONG = 320;

/** Every helper does nothing when the user asks for less motion. */
function reducedMotion(): boolean {
  return typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Individual transform properties: they add to the element's own `transform` instead of replacing it.
const placed = (r: Rect, from: Rect) => {
  const d = flipDelta(r, from);
  return { translate: `${d.x}px ${d.y}px`, scale: `${d.sx} ${d.sy}` };
};
const AT_REST = { translate: "0 0", scale: "1 1" };

// A light copy for flights and exits: the element's own box and its first row (a title), nothing live.
function ghost(source: Element, at: Rect): HTMLElement {
  const g = source.cloneNode(false) as HTMLElement;
  if (source.firstElementChild) g.append(source.firstElementChild.cloneNode(true));
  for (const name of g.getAttributeNames()) if (name === "id" || name.startsWith("data-") || name.startsWith("aria-")) g.removeAttribute(name);
  for (const el of g.querySelectorAll("[id]")) el.removeAttribute("id");
  g.inert = true;
  g.setAttribute("aria-hidden", "true");
  // Inline, so no class rule of the source (a maximized window) can win over the fixed placement.
  Object.assign(g.style, {
    position: "fixed",
    left: `${at.left}px`,
    top: `${at.top}px`,
    width: `${at.width}px`,
    height: `${at.height}px`,
    margin: "0",
    zIndex: "60",
    pointerEvents: "none",
    transformOrigin: "0 0",
  });
  document.body.append(g);
  return g;
}

function removeWhenDone(anim: Animation, el: Element): Animation {
  const remove = () => el.remove();
  anim.finished.then(remove, remove);
  return anim;
}

/** A small pop on the element that just received something. */
function bounce(el: Element): Animation | null {
  if (reducedMotion()) return null;
  return el.animate([{ scale: "1" }, { scale: "1.12" }, { scale: "1" }], { duration: BASE, easing: EASE });
}

/** A ghost of `source` flies from `from` into `target` and shrinks; the target bounces when it lands. */
export function fly(source: Element, target: Element | null, from: Rect = source.getBoundingClientRect()): Animation | null {
  if (!target || reducedMotion()) return null;
  const g = ghost(source, from);
  const end = fitInto(from, target.getBoundingClientRect());
  const anim = g.animate([{ ...AT_REST, opacity: 1 }, { ...placed(end, from), opacity: 0.4 }], { duration: LONG, easing: EASE });
  anim.finished.then(() => bounce(target), () => {});
  return removeWhenDone(anim, g);
}

/** A ghost of a removed element fades and shrinks in place, so the state can drop it at once. */
function exit(source: Element, from: Rect): Animation | null {
  if (reducedMotion()) return null;
  const g = ghost(source, from);
  g.style.transformOrigin = "center";
  return removeWhenDone(g.animate([{ opacity: 1, scale: "1" }, { opacity: 0, scale: "0.94" }], { duration: SHORT, easing: EASE }), g);
}

/** Fades the element in from a slight offset or scale: dialogs, menus, new windows. */
export function enter(el: Element, { y = 0, scale = 1, duration = BASE }: { y?: number; scale?: number; duration?: number } = {}): Animation | null {
  if (reducedMotion()) return null;
  return el.animate([{ opacity: 0, translate: `0 ${y}px`, scale: `${scale}` }, { opacity: 1, translate: "0 0", scale: "1" }], { duration, easing: EASE });
}

/** Slides an element from its old rect to the one it has now (FLIP), above its neighbours while it moves. */
function flip(el: Element, before: Rect, { delay = 0, fade = false } = {}): Animation | null {
  if (reducedMotion()) return null;
  const after = el.getBoundingClientRect();
  if (!moved(before, after)) return null;
  return el.animate(
    [
      { ...placed(before, after), transformOrigin: "0 0", opacity: fade ? 0.5 : 1, zIndex: 4 },
      { ...AT_REST, transformOrigin: "0 0", opacity: 1, zIndex: 4 },
    ],
    { duration: LONG, delay, easing: SPRING, fill: "backwards" },
  );
}

type Measured = Map<string, { el: Element; rect: Rect }>;

interface Snapshot {
  items: Measured;
  origins: Measured;
}

function measure(root: Element, attr?: string): Measured {
  if (!attr) return new Map();
  return new Map(Array.from(root.querySelectorAll(`[${attr}]`), (el) => [el.getAttribute(attr)!, { el, rect: el.getBoundingClientRect() }]));
}

/**
 * Animates the `[item]` elements under `root` each time `key` changes: kept ones slide to their new rect,
 * new ones fade in, removed ones fade out. An `[origin]` element with the same id (a dock chip) is where
 * an item flies to when it leaves and comes from when it returns.
 */
export function useFlip(root: RefObject<HTMLElement | null>, key: string, { item, origin, enabled = true }: { item: string; origin?: string; enabled?: boolean }) {
  const committed = useRef<{ key: string; enabled: boolean } | null>(null);
  const snapshot = useRef<Snapshot | null>(null);
  const running = useRef(new Set<Animation>());

  // Measured during render, while the DOM still shows the old layout (the getSnapshotBeforeUpdate idea).
  const last = committed.current;
  if (last && last.enabled && enabled && key !== last.key && !snapshot.current && root.current) {
    snapshot.current = { items: measure(root.current, item), origins: measure(root.current, origin) };
  }

  useLayoutEffect(() => {
    const before = snapshot.current;
    snapshot.current = null;
    committed.current = { key, enabled };
    const el = root.current;
    if (!before || !el || reducedMotion()) return;
    // The snapshot already holds where things looked; a running move would skew the new rects.
    running.current.forEach((anim) => anim.cancel());
    const items = measure(el, item);
    const origins = measure(el, origin);
    const plan = flipPlan({ items: before.items.keys(), origins: before.origins.keys() }, { items: items.keys(), origins: origins.keys() });
    // A closed item fades first, then the others slide into its place.
    const leaving = plan.some((s) => s.kind === "leave" && !s.toOrigin);
    const track = (anim: Animation | null) => {
      if (!anim) return;
      running.current.add(anim);
      const done = () => running.current.delete(anim);
      anim.finished.then(done, done);
    };
    for (const step of plan) {
      const now = items.get(step.id)?.el;
      const was = before.items.get(step.id);
      if (step.kind === "move" && now && was) track(flip(now, was.rect, { delay: leaving ? SHORT / 2 : 0 }));
      else if (step.kind === "enter" && now) {
        const chip = before.origins.get(step.id)?.rect;
        track(chip ? flip(now, fitInto(now.getBoundingClientRect(), chip), { fade: true }) : enter(now, { scale: 0.96 }));
      } else if (step.kind === "leave" && was) track(step.toOrigin ? fly(was.el, origins.get(step.id)!.el, was.rect) : exit(was.el, was.rect));
    }
  }, [key, enabled]);

  useEffect(() => () => running.current.forEach((anim) => anim.cancel()), []);
}
