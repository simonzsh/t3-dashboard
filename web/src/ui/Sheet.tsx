import { useEffect, useRef, type ReactNode } from "react";
import { trapTab } from "./Dialog.tsx";
import { lockScroll } from "./scrollLock.ts";
import { useEscape } from "./useEscape.ts";

interface Props {
  open: boolean;
  /** Accessible name of the dialog. */
  label: string;
  onClose: () => void;
  /** `narrow` is 380 px, `wide` is 600 px; both fill a phone. */
  width?: "narrow" | "wide";
  children?: ReactNode;
}

const ignore = () => {};

/** Side sheet under the header. It stays mounted: `open` drives the slide and the backdrop fade, both ways. */
export function Sheet({ open, label, onClose, width = "narrow", children }: Props) {
  const sheet = useRef<HTMLElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  useEscape(open ? onClose : ignore);

  // The sheet takes the focus when it opens, and gives it back when it closes.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement;
    sheet.current?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) before.focus();
    };
  }, [open]);

  // Same rule as Dialog: the page behind never scrolls, not through the backdrop, not past the end of the sheet.
  useEffect(() => {
    const root = backdrop.current;
    const el = sheet.current;
    if (!open || !root || !el) return;
    const unlockBackdrop = lockScroll(root, el);
    const unlockSheet = lockScroll(el, el);
    return () => {
      unlockBackdrop();
      unlockSheet();
    };
  }, [open]);

  return (
    <>
      <div ref={backdrop} className={`ui-sheet-backdrop${open ? " open" : ""}`} aria-hidden="true" onClick={onClose} />
      <aside ref={sheet} tabIndex={-1} className={`ui-sheet ${width}${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-label={label} inert={!open} onKeyDown={trapTab}>
        {children}
      </aside>
    </>
  );
}
