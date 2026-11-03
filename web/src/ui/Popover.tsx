import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { placeMenu } from "../lib/dropdown.ts";
import { enter } from "./motion.ts";

interface Props {
  anchor: RefObject<HTMLElement | null>;
  /** "escape" and "outside" tell the owner whether to give the focus back. */
  onClose: (reason: "escape" | "outside") => void;
  align?: "start" | "end";
  minWidth?: number;
  matchWidth?: boolean;
  className?: string;
  role?: string;
  children: ReactNode;
}

// Open popovers, innermost last: Escape closes only the innermost one.
const open: object[] = [];

/** A menu in document.body, fixed next to its anchor: no scrolling parent can clip it. */
export function Popover({ anchor, onClose, align = "start", minWidth = 0, matchWidth = false, className = "", role, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const inside = useRef(false);
  const self = useRef({});
  const close = useRef(onClose);
  close.current = onClose;

  useLayoutEffect(() => {
    const place = () => {
      const el = box.current;
      const trigger = anchor.current;
      if (!el || !trigger) return;
      el.style.maxHeight = "";
      el.style.minWidth = "";
      const a = trigger.getBoundingClientRect();
      el.style.minWidth = `${matchWidth ? Math.max(minWidth, a.width) : minWidth}px`;
      const size = el.getBoundingClientRect();
      const p = placeMenu(a, size, { width: window.innerWidth, height: window.innerHeight }, { align, minWidth, matchWidth });
      el.style.left = `${p.left}px`;
      el.style.top = `${p.top}px`;
      el.style.maxHeight = p.maxHeight === undefined ? "" : `${p.maxHeight}px`;
      el.style.visibility = "visible";
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [align, minWidth, matchWidth]);

  useLayoutEffect(() => {
    const anim = box.current && enter(box.current, { y: -4, duration: 160 });
    return () => anim?.cancel();
  }, []);

  useEffect(() => {
    // React events cross portals: a click in a child menu marks this one as inside too.
    const down = (e: MouseEvent) => {
      const wasInside = inside.current;
      inside.current = false;
      const target = e.target as Node;
      if (!wasInside && !box.current?.contains(target) && !anchor.current?.contains(target)) close.current("outside");
    };
    // Capture and stop: a dialog or the Desk must not also react to this Escape.
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || open[open.length - 1] !== self.current) return;
      e.stopPropagation();
      close.current("escape");
    };
    open.push(self.current);
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key, true);
    return () => {
      open.splice(open.indexOf(self.current), 1);
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key, true);
    };
  }, []);

  return createPortal(
    <div ref={box} className={`popover ${className}`.trim()} role={role} style={{ visibility: "hidden" }} onMouseDown={() => (inside.current = true)}>
      {children}
    </div>,
    document.body,
  );
}
