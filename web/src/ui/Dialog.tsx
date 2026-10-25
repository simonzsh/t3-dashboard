import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "./Button.tsx";
import { Icon } from "./Icon.tsx";
import { IconButton } from "./IconButton.tsx";
import { useEscape } from "./useEscape.ts";

interface Action {
  label: string;
  onClick: () => void;
  disabled?: boolean;
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
  className?: string;
  children?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ title, label, onClose, onCancel, cancelLabel = "Cancel", primary, className, children }: Props) {
  useEscape(onClose);
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);

  // Focus the autoFocus element or the first focusable one; give focus back on unmount.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const root = box.current;
    if (root && !root.contains(document.activeElement)) root.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => previous?.focus?.();
  }, []);

  function trapTab(e: KeyboardEvent<HTMLDivElement>) {
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
  return (
    <div className="dialog-backdrop" onClick={onClose}>
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
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <IconButton label="Close" shortcut="Esc" variant="ghost" size="sm" className="dialog-close" onClick={onClose}>
            <Icon name="x" />
          </IconButton>
        </div>
        {children}
        {(onCancel || primary) && (
          <div className="buttons dialog-actions">
            {onCancel && <Button onClick={onCancel}>{cancelLabel}</Button>}
            {primary && (
              <Button variant="primary" disabled={primary.disabled} onClick={primary.onClick}>
                {primary.label}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
