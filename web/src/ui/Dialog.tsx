import type { ReactNode } from "react";
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

export function Dialog({ title, label, onClose, onCancel, cancelLabel = "Cancel", primary, className, children }: Props) {
  useEscape(onClose);
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className={className ? `dialog ${className}` : "dialog"}
        role="dialog"
        aria-modal="true"
        aria-label={label ?? (typeof title === "string" ? title : undefined)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-head">
          <h2>{title}</h2>
          <IconButton label="Close" title="Close (Esc)" variant="ghost" size="sm" className="dialog-close" onClick={onClose}>
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
