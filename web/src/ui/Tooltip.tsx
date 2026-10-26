import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Kbd } from "./Kbd.tsx";
import { placeTooltip } from "./tooltipPlacement.ts";

interface Shown {
  anchor: HTMLElement;
  text: string;
  shortcut?: string;
}

// Tooltips that repeat the visible text only help when the ellipsis or line clamp hides part of it.
const isClipped = (el: HTMLElement) => el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight;

/** One layer for the whole app: it follows the pointer and the keyboard focus over `data-tooltip` elements. */
export function TooltipLayer() {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const show = (target: EventTarget | null) => {
      const anchor = target instanceof Element ? target.closest<HTMLElement>("[data-tooltip]") : null;
      if (!anchor || window.matchMedia("(hover: none)").matches || (anchor.hasAttribute("data-tooltip-clipped") && !isClipped(anchor))) return setShown(null);
      setShown((now) => (now?.anchor === anchor ? now : { anchor, text: anchor.dataset.tooltip!, shortcut: anchor.dataset.shortcut }));
    };
    const hide = () => setShown(null);
    const onPointerOver = (e: PointerEvent) => show(e.target);
    // A click focuses its button too: only keyboard focus opens a tooltip.
    const onFocusIn = (e: FocusEvent) => (e.target instanceof Element && e.target.matches(":focus-visible") ? show(e.target) : hide());
    const onKeyDown = (e: KeyboardEvent) => e.key === "Escape" && hide();
    const root = document.documentElement;
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", hide);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("keydown", onKeyDown);
    root.addEventListener("pointerleave", hide);
    window.addEventListener("blur", hide);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", hide);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("pointerleave", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // Link the anchor to the tooltip, unless its accessible name already says the same.
  useEffect(() => {
    const anchor = shown?.anchor;
    if (!anchor || anchor.getAttribute("aria-label") === shown.text || anchor.hasAttribute("aria-describedby")) return;
    anchor.setAttribute("aria-describedby", id);
    return () => anchor.removeAttribute("aria-describedby");
  }, [shown, id]);

  useLayoutEffect(() => {
    const tip = box.current;
    if (!shown || !tip) return;
    const r = shown.anchor.getBoundingClientRect();
    const { left, top } = placeTooltip({ left: r.left, top: r.top, width: r.width, height: r.height }, { width: tip.offsetWidth, height: tip.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }, [shown]);

  if (!shown) return null;
  return (
    <div ref={box} id={id} role="tooltip" className="tooltip">
      {shown.text}
      {shown.shortcut && <Kbd>{shown.shortcut}</Kbd>}
    </div>
  );
}
