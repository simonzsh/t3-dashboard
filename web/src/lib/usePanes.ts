import { useLayoutEffect, useRef, useState, type TouchEvent } from "react";
import { enter } from "../ui/index.ts";
import { swipeDirection } from "./swipe.ts";

/** One pane at a time: a horizontal swipe or `show` switches it, and the new pane slides in from its side. Pane is null when disabled. */
export function usePanes<T extends string>(ids: readonly T[], enabled: boolean) {
  const [picked, setPicked] = useState<T | null>(null);
  // A pane that is gone (a board column that emptied) falls back to the first one.
  const pane = picked && ids.includes(picked) ? picked : ids[0];
  const layout = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const shown = useRef(pane);
  const side = useRef(1);
  useLayoutEffect(() => {
    if (shown.current === pane) return;
    shown.current = pane;
    const el = layout.current?.firstElementChild;
    if (el) enter(el, { x: side.current * 32, duration: 200 });
  }, [pane]);
  const show = (next: T) => {
    if (next === pane) return;
    side.current = ids.indexOf(next) > ids.indexOf(pane as T) ? 1 : -1;
    // The page scrolls on a phone: the new pane starts at its top, not halfway down.
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
    setPicked(next);
  };
  const swipe = enabled
    ? {
        onTouchStart: (e: TouchEvent) => {
          const t = e.touches[0];
          start.current = e.touches.length === 1 && t ? { x: t.clientX, y: t.clientY } : null;
        },
        onTouchEnd: (e: TouchEvent) => {
          const from = start.current;
          const t = e.changedTouches[0];
          start.current = null;
          if (!from || !t) return;
          const dir = swipeDirection(t.clientX - from.x, t.clientY - from.y);
          const next = dir && ids[ids.indexOf(pane as T) + (dir === "left" ? 1 : -1)];
          if (next) show(next);
        },
      }
    : {};
  return { pane: enabled ? pane : null, show, layout, swipe };
}
