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
  /** Never wider than the anchor: long rows are cut instead. */
  fitWidth?: boolean;
  preferAbove?: boolean;
  className?: string;
  role?: string;
  children: ReactNode;
}

// Open popovers, innermost last: Escape closes only the innermost one.
const open: object[] = [];

/** A menu in document.body, fixed next to its anchor: no scrolling parent can clip it. */
export function Popover({ anchor, onClose, align = "start", minWidth = 0, matchWidth = false, fitWidth = false, preferAbove = false, className = "", role, children }: Props) {
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
      if (fitWidth) el.style.maxWidth = `${Math.max(minWidth, a.width)}px`;
      const size = el.getBoundingClientRect();
      // A phone keyboard hides the bottom of the page without changing innerHeight: place within what is visible.
      const vv = window.visualViewport;
      const [dx, dy] = vv ? [vv.offsetLeft, vv.offsetTop] : [0, 0];
      const view = vv ? { width: vv.width, height: vv.height } : { width: window.innerWidth, height: window.innerHeight };
      const shifted = { left: a.left - dx, top: a.top - dy, width: a.width, height: a.height };
      const p = placeMenu(shifted, size, view, { align, minWidth, matchWidth, preferAbove });
      el.style.left = `${p.left + dx}px`;
      // Above: hold the bottom edge, so a list that shrinks stays against its anchor with no new pass.
      const layoutHeight = document.documentElement.clientHeight;
      el.style.top = p.above ? "auto" : `${p.top + dy}px`;
      el.style.bottom = p.above ? `${layoutHeight - (p.top + dy + Math.min(size.height, p.maxHeight ?? Infinity))}px` : "auto";
      el.style.maxHeight = p.maxHeight === undefined ? "" : `${p.maxHeight}px`;
      el.style.visibility = "visible";
    };
    place();
    // Follow an anchor that still moves, e.g. in a dialog that animates in, until it stays still.
    let frame = 0;
    let last = "";
    let still = 0;
    const follow = () => {
      const a = anchor.current?.getBoundingClientRect();
      const key = a ? `${a.left},${a.top},${a.width}` : "";
      if (key === last) still++;
      else [last, still] = [key, 0];
      if (still === 0) place();
      if (still < 3) frame = requestAnimationFrame(follow);
    };
    frame = requestAnimationFrame(follow);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    // A filtered list shrinks: place it again so a menu above its anchor stays against it.
    const resized = new ResizeObserver(() => place());
    if (box.current) resized.observe(box.current);
    return () => {
      resized.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
    };
  }, [align, minWidth, matchWidth, fitWidth, preferAbove]);

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
    // Capture and stop: a dialog or the Sessions page must not also react to this Escape.
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
