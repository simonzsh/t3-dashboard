import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { reducedMotion } from "./motion.ts";

/** Keep opened content mounted so a close can animate and a reopen keeps its state. */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  const [seen, setSeen] = useState(open);
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const height = useRef(0);
  useLayoutEffect(() => {
    if (open) setSeen(true);
    const el = root.current;
    const inner = content.current;
    if (!el || !inner) return;
    const resize = () => {
      const next = open ? inner.getBoundingClientRect().height : 0;
      if (next === height.current) return;
      const from = el.getBoundingClientRect().height;
      animation.current?.cancel();
      height.current = next;
      el.style.height = `${next}px`;
      if (!reducedMotion()) {
        animation.current = el.animate([{ height: `${from}px` }, { height: `${next}px` }], {
          duration: 80, easing: "cubic-bezier(0.2, 0, 0, 1)",
        });
      }
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [open, seen]);
  useLayoutEffect(() => () => animation.current?.cancel(), []);
  return <div ref={root} className="ui-collapse" inert={!open} aria-hidden={!open}>
    <div ref={content}>{(open || seen) && children}</div>
  </div>;
}
