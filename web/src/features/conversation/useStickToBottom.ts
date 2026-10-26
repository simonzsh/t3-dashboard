import { useEffect, useRef, type RefObject } from "react";

// How long after a resize of the area a scroll event still counts as caused by the new layout.
export const RESIZE_SETTLE_MS = 200;

// While `stick` holds, any change of the content or of the area keeps the bottom in view:
// streamed text, new rows, loaded images, a growing composer, a resized window.
// Returns the time of the last resize of the area: the relayout scrolls the page by itself (clamp, anchoring),
// and the scroll handler must not read that as the user leaving the bottom.
export function useStickToBottom(scroller: RefObject<HTMLElement | null>, stick: RefObject<boolean>): RefObject<number> {
  const resizedAt = useRef(-Infinity);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const follow = () => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    };
    const sizes = new ResizeObserver(follow);
    const area = new ResizeObserver(() => {
      resizedAt.current = performance.now();
    });
    area.observe(el);
    sizes.observe(el);
    for (const child of el.children) sizes.observe(child);
    const children = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => n instanceof Element && sizes.observe(n));
        r.removedNodes.forEach((n) => n instanceof Element && sizes.unobserve(n));
      }
      follow();
    });
    children.observe(el, { childList: true });
    return () => {
      area.disconnect();
      sizes.disconnect();
      children.disconnect();
    };
  }, []);
  return resizedAt;
}
