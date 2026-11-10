import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { CollapseMotion } from "./collapseMotion.ts";

/** Keep opened content mounted so a close can animate and a reopen keeps its state. */
export function Collapse({ open, children, duration = 80 }: { open: boolean; children: ReactNode; duration?: number }) {
  const [seen, setSeen] = useState(open);
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [motion] = useState(() => new CollapseMotion());
  useLayoutEffect(() => {
    if (open) setSeen(true);
    const el = root.current;
    const inner = content.current;
    if (!el || !inner) return;
    const resize = () => motion.resize(el, inner, open, duration);
    resize();
    const observer = new ResizeObserver(([entry]) => {
      const box = entry?.borderBoxSize?.[0];
      if (!box) { resize(); return; }
      motion.resize(el, inner, open, duration, { width: Math.round(box.inlineSize), height: Math.round(box.blockSize) });
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, [open, seen, duration, motion]);
  useLayoutEffect(() => () => motion.cancel(), [motion]);
  return <div ref={root} className="ui-collapse" inert={!open} aria-hidden={!open}>
    <div ref={content}>{(open || seen) && children}</div>
  </div>;
}
