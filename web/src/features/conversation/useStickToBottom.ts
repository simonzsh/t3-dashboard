import { useEffect, type RefObject } from "react";

// While `stick` holds, any change of the content or of the area keeps the bottom in view:
// streamed text, new rows, loaded images, a growing composer, a resized window.
export function useStickToBottom(scroller: RefObject<HTMLElement | null>, stick: RefObject<boolean>): void {
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const follow = () => {
      if (stick.current) el.scrollTop = el.scrollHeight;
    };
    const sizes = new ResizeObserver(follow);
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
      sizes.disconnect();
      children.disconnect();
    };
  }, []);
}
