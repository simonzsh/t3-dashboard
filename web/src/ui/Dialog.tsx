import { useEffect, useId, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";
import { IconButton } from "./IconButton.tsx";
import { enter, leaveCopy, reducedMotion } from "./motion.ts";
import { useEscape } from "./useEscape.ts";

interface Action {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  /** A destructive action: the primary button turns red. */
  danger?: boolean;
}

interface Props {
  title: ReactNode;
  /** Accessible name when the title is long or not plain text. */
  label?: string;
  /** Escape, a click outside and the close button call it. */
  onClose: () => void;
  /** With onCancel or primary, an action row ends the dialog: Cancel left, primary right. */
  onCancel?: () => void;
  cancelLabel?: string;
  primary?: Action;
  /** A second choice between Cancel and the primary action. */
  secondary?: Action;
  className?: string;
  /** Kept mounted but out of sight and deaf to Escape, e.g. while another dialog takes its place. */
  hidden?: boolean;
  children?: ReactNode;
}

const ignore = () => {};

// Same breakpoint as the bottom bar in styles.css: there the dialog is a bottom sheet.
const isPhone = () => typeof matchMedia === "function" && matchMedia("(max-width: 700px)").matches;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Tab and Shift+Tab stay inside the element that has this handler (a modal). */
export function trapTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab") return;
  const items = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE));
  if (items.length === 0) return e.preventDefault();
  const first = items[0]!;
  const last = items[items.length - 1]!;
  const active = document.activeElement;
  if (e.shiftKey && (active === first || !e.currentTarget.contains(active))) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && (active === last || !e.currentTarget.contains(active))) {
    e.preventDefault();
    first.focus();
  }
}

export function Dialog({ title, label, onClose, onCancel, cancelLabel = "Cancel", primary, secondary, className, hidden = false, children }: Props) {
  useEscape(hidden ? ignore : onClose);
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);

  // Before the first paint, so the dialog never shows at full size first. On close, a copy fades out: React removes the real one at once.
  useLayoutEffect(() => {
    const root = backdrop.current;
    const el = box.current;
    const phone = isPhone();
    const anims = [root && enter(root), el && (phone ? enter(el, { y: el.offsetHeight, duration: 320 }) : enter(el, { y: 16, scale: 0.85, duration: 420, spring: true }))];
    return () => {
      anims.forEach((anim) => anim?.cancel());
      if (root) leaveCopy(root, ".dialog", phone ? { translate: "0 100%", scale: "1" } : undefined);
    };
  }, []);

  // iOS leaves fixed elements under the keyboard: on a phone, fit the backdrop to the visible part of the page.
  useEffect(() => {
    const root = backdrop.current;
    const vv = window.visualViewport;
    if (!root || !vv || !isPhone()) return;
    const fit = () => {
      root.style.top = `${vv.offsetTop}px`;
      root.style.setProperty("--visible-h", `${vv.height}px`);
    };
    // The sheet just got shorter: keep the field being typed in on screen.
    const resized = () => {
      fit();
      const active = document.activeElement;
      if (active instanceof HTMLElement && box.current?.contains(active)) active.scrollIntoView({ block: "nearest" });
    };
    fit();
    vv.addEventListener("resize", resized);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", resized);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  // Phone sheet: drag the head down to close. A short or slow drag slides back.
  const drag = useRef<{ id: number; y: number; t: number; dy: number } | null>(null);
  const onDragStart = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button === 0 && isPhone()) drag.current = { id: e.pointerId, y: e.clientY, t: e.timeStamp, dy: 0 };
  };
  const onDragMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !box.current) return;
    d.dy = Math.max(0, e.clientY - d.y);
    // Capture only past a few pixels, so a tap on the close button stays a click.
    if (d.dy > 6 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    box.current.style.translate = `0 ${d.dy}px`;
  };
  const onDragEnd = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    const el = box.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (!el || d.dy === 0) return;
    const back = () => {
      el.style.translate = "";
      if (!reducedMotion()) el.animate([{ translate: `0 ${d.dy}px` }, { translate: "0 0" }], { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" });
    };
    const flick = d.dy > 40 && d.dy / Math.max(1, e.timeStamp - d.t) > 0.6;
    if (e.type !== "pointerup" || (d.dy < 80 && !flick)) return back();
    // The exit copy starts from the dragged spot; slide back only if the parent keeps the dialog open.
    onClose();
    setTimeout(() => el.isConnected && back(), 50);
  };

  // Read before the children's effects: a menu that opens on mount takes the focus there.
  const previous = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    previous.current = document.activeElement as HTMLElement | null;
  }, []);

  // Focus the autoFocus element or the first focusable one; give focus back on unmount.
  useEffect(() => {
    const root = box.current;
    const active = document.activeElement;
    if (root && !root.contains(active) && !active?.closest(".popover")) root.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous.current?.focus?.();
  }, []);

  return (
    <div className="dialog-backdrop" ref={backdrop} onClick={onClose} hidden={hidden}>
      <div
        className={className ? `dialog ${className}` : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={label ? undefined : titleId}
        ref={box}
        onKeyDown={trapTab}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head" onPointerDown={onDragStart} onPointerMove={onDragMove} onPointerUp={onDragEnd} onPointerCancel={onDragEnd}>
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Close" variant="ghost" size="sm" className="dialog-close" onClick={onClose}>
            <Icon name="x" />
          </IconButton>
        </div>
        {children}
        {(onCancel || primary || secondary) && (
          <div className="buttons dialog-actions">
            {onCancel && <Button onClick={onCancel}>{cancelLabel}</Button>}
            {secondary && (
              <Button disabled={secondary.disabled} onClick={secondary.onClick}>
                {secondary.label}
              </Button>
            )}
            {primary && (
              <Button variant={primary.danger ? "danger" : "primary"} disabled={primary.disabled} onClick={primary.onClick}>
                {primary.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
