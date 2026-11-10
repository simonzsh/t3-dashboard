import { useLayoutEffect, useRef, type RefObject } from "react";
import { reducedMotion } from "./motion.ts";

interface Box { left: number; width: number }
interface Snapshot { panel: Box; content: Box }

/** Keep the content's layout width constant while the panel edge moves. */
export function animatePanel(panel: HTMLElement, content: HTMLElement, before: Snapshot): Animation[] {
  if (reducedMotion()) return [];
  const after = panel.getBoundingClientRect();
  const next = content.getBoundingClientRect();
  if (after.width === before.panel.width || !next.width) return [];
  const timing = { duration: 240, easing: "cubic-bezier(0.2, 0, 0, 1)" };
  // Width plus margin stays constant, so the adjacent content lays out only once.
  const edge = panel.animate([
    { width: `${before.panel.width}px`, marginRight: `${after.width - before.panel.width}px` },
    { width: `${after.width}px`, marginRight: "0px" },
  ], timing);
  const body = content.animate([
    { translate: `${before.content.left - next.left}px 0`, scale: `${before.content.width / next.width} 1`, transformOrigin: "0 0" },
    { translate: "0 0", scale: "1 1", transformOrigin: "0 0" },
  ], timing);
  return [edge, body];
}

/** Capture the visible position before a toggle, including an interrupted animation. */
export function usePanelMotion(root: RefObject<HTMLElement | null>, collapsed: boolean): void {
  const committed = useRef(collapsed);
  const snapshot = useRef<Snapshot | null>(null);
  const running = useRef<Animation[]>([]);
  if (committed.current !== collapsed && !snapshot.current) {
    const panel = root.current;
    const content = panel?.nextElementSibling;
    if (panel && content) snapshot.current = { panel: panel.getBoundingClientRect(), content: content.getBoundingClientRect() };
  }
  useLayoutEffect(() => {
    const before = snapshot.current;
    snapshot.current = null;
    committed.current = collapsed;
    running.current.forEach(animation => animation.cancel());
    running.current = [];
    const panel = root.current;
    const content = panel?.nextElementSibling;
    if (before && panel && content instanceof HTMLElement) running.current = animatePanel(panel, content, before);
  }, [collapsed, root]);
  useLayoutEffect(() => () => {
    running.current.forEach(animation => animation.cancel());
  }, []);
}
