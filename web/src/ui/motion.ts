import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { fitInto, flipDelta, flipPlan, moved, type Rect } from "./flip.ts";

const EASE = "cubic-bezier(0.2, 0, 0, 1)";
// Overshoots a little: the light bounce at the end of a move.
const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";
const SHORT = 160;
const BASE = 240;
const LONG = 320;

/** Every helper does nothing when the user asks for less motion. */
export function reducedMotion(): boolean {
  return typeof matchMedia !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type PausableAnimation = Pick<Animation, "playState" | "pause" | "play">;

/** Resume only animations that still belong to the connected element and remain paused. */
export function pauseAnimations(element: { readonly isConnected: boolean; getAnimations(): readonly PausableAnimation[] }): () => void {
  const paused = element.getAnimations().filter(animation => animation.playState === "running");
  paused.forEach(animation => animation.pause());
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    if (!element.isConnected) return;
    const current = new Set(element.getAnimations());
    for (const animation of paused) {
      if (current.has(animation) && animation.playState === "paused") animation.play();
    }
  };
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
    listStyle: "none",
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

/**
 * Call it while React unmounts `el`: an inert copy (typed values included) fades out where it was, `part` also moves to `to`.
 * Nothing plays if `el` is still in the page after the commit (a StrictMode remount in development).
 */
export function leaveCopy(el: HTMLElement, part?: string, to: Keyframe = { translate: "0 8px", scale: "0.96" }, { duration = SHORT, easing = EASE }: { duration?: number; easing?: string } = {}): void {
  if (el.hidden || reducedMotion()) return;
  const copy = el.cloneNode(true) as HTMLElement;
  const fields = el.querySelectorAll<HTMLInputElement>("input, textarea, select");
  copy.querySelectorAll<HTMLInputElement>("input, textarea, select").forEach((field, i) => {
    if (field.type !== "file") field.value = fields[i]?.value ?? "";
  });
  for (const node of [copy, ...copy.querySelectorAll("[id]")]) node.removeAttribute("id");
  copy.inert = true;
  copy.setAttribute("aria-hidden", "true");
  copy.style.pointerEvents = "none";
  queueMicrotask(() => {
    if (el.isConnected) return;
    document.body.append(copy);
    const moving = copy.querySelector<HTMLElement>(part ?? ":not(*)");
    // Starts where a drag left it, not at rest.
    moving?.animate([{ translate: moving.style.translate || "0 0", scale: "1" }, to], { duration, easing, fill: "forwards" });
    removeWhenDone(copy.animate([{ opacity: 1 }, { opacity: 0 }], { duration, easing, fill: "forwards" }), copy);
  });
}

/** A small pop on the element that just received something. */
function bounce(el: Element): Animation | null {
  if (reducedMotion()) return null;
  return el.animate([{ scale: "1" }, { scale: "1.12" }, { scale: "1" }], { duration: BASE, easing: EASE });
}

/** A ghost of `source` flies from its place into `target` and shrinks; the target bounces when it lands. */
export function fly(source: Element, target: Element | null): Animation | null {
  if (!target || reducedMotion()) return null;
  const from = source.getBoundingClientRect();
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
export function enter(el: Element, { x = 0, y = 0, scale = 1, duration = BASE, delay = 0, spring = false, highlight }: { x?: number; y?: number; scale?: number; duration?: number; delay?: number; spring?: boolean; highlight?: string } = {}): Animation | null {
  if (reducedMotion()) return null;
  const from = { opacity: 0, translate: `${x}px ${y}px`, scale: `${scale}` };
  const rest = { opacity: 1, translate: "0 0", scale: "1" };
  // The spring overshoots once, then settles: a visible bounce, not a wobble.
  const frames = spring
    ? [{ ...from, easing: "ease-out" }, { opacity: 1, translate: "0 -2px", scale: "1.04", offset: 0.55, easing: "ease-in-out" }, { scale: "0.99", offset: 0.8, easing: "ease-in-out" }, rest]
    : highlight ? [{ ...from, backgroundColor: highlight }, { ...rest, backgroundColor: highlight, offset: 0.45 }, { ...rest, backgroundColor: "transparent" }] : [from, rest];
  return el.animate(frames, { duration, delay, fill: "backwards", easing: spring ? "linear" : EASE });
}

/** Slides an element from its old rect to the one it has now (FLIP), above its neighbours while it moves. */
export function animateFlip(el: Element, before: Rect, after: Rect, delay: number, spring = true): Animation | null {
  if (reducedMotion()) return null;
  if (!moved(before, after)) return null;
  return el.animate(
    [
      { ...placed(before, after), transformOrigin: "0 0", zIndex: 4 },
      { ...AT_REST, transformOrigin: "0 0", zIndex: 4 },
    ],
    { duration: spring ? LONG : BASE, delay, easing: spring ? SPRING : EASE, fill: "backwards" },
  );
}

type Measured = Map<string, { el: Element; rect: Rect }>;

function measure(root: Element, attr: string): Measured {
  return new Map(Array.from(root.querySelectorAll(`[${attr}]`), (el) => [el.getAttribute(attr)!, { el, rect: el.getBoundingClientRect() }]));
}

/** Animates the `[item]` elements under `root` each time `key` changes: kept ones slide to their new rect, new ones fade in, removed ones fade out. */
export function useFlip(root: RefObject<HTMLElement | null>, key: string, { item, enabled = true, initial = false, enter: entrance, stagger = 0, spring = true }: { item: string; enabled?: boolean; initial?: boolean; enter?: Parameters<typeof enter>[1]; stagger?: number; spring?: boolean }) {
  const committed = useRef<{ key: string; enabled: boolean } | null>(null);
  const snapshot = useRef<Measured | null>(null);
  const running = useRef(new Set<Animation>());

  // Measured during render, while the DOM still shows the old layout (the getSnapshotBeforeUpdate idea).
  const last = committed.current;
  if (!last && initial && enabled && !snapshot.current) snapshot.current = new Map();
  if (last && last.enabled && enabled && key !== last.key && !snapshot.current && root.current) {
    snapshot.current = measure(root.current, item);
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
    const plan = flipPlan(before.keys(), items.keys());
    // A closed item fades first, then the others slide into its place.
    const leaving = plan.some((s) => s.kind === "leave");
    const track = (anim: Animation | null) => {
      if (!anim) return;
      running.current.add(anim);
      const done = () => running.current.delete(anim);
      anim.finished.then(done, done);
    };
    let entered = 0;
    for (const step of plan) {
      const now = items.get(step.id)?.el;
      const was = before.get(step.id);
      if (step.kind === "move" && now && was) track(animateFlip(now, was.rect, items.get(step.id)!.rect, leaving ? SHORT / 2 : 0, spring));
      else if (step.kind === "enter" && now) track(enter(now, { scale: 0.96, ...entrance, delay: Math.min(entered++ * stagger, SHORT) }));
      else if (step.kind === "leave" && was) track(exit(was.el, was.rect));
    }
  }, [key, enabled]);

  useEffect(
    () => () => {
      running.current.forEach((anim) => anim.cancel());
    },
    [],
  );
}
