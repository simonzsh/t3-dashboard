import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { moveActive } from "../lib/dropdown.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { IconButton } from "./IconButton.tsx";
import { Popover } from "./Popover.tsx";

export interface ActionMenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Says why an item is disabled. */
  tooltip?: string;
}

interface Props {
  /** Accessible name of the "…" button. */
  label: string;
  tooltip?: string;
  items: ActionMenuItem[];
  /** Extra classes on the "…" button. */
  className?: string;
}

/** The "…" button of a row, and its menu of actions. Same menu, rows and keys as the Dropdown. */
export function ActionMenu({ label, tooltip, items, className }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();

  // The menu is a portal: the list takes the focus, and the active row moves with the arrows.
  useEffect(() => {
    if (open) list.current?.focus({ preventScroll: true });
  }, [open]);

  function show() {
    setActive(-1);
    setOpen(true);
  }

  function close(refocus: boolean) {
    setOpen(false);
    if (refocus) anchor.current?.focus();
  }

  function pick(item: ActionMenuItem) {
    if (item.disabled) return;
    close(false);
    item.onSelect();
  }

  // Escape is handled by the Popover.
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive(moveActive(items.length, active, e.key === "ArrowDown" ? 1 : -1));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? 0 : items.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = items[active];
      if (item) pick(item);
    } else if (e.key === "Tab") {
      close(false);
    }
  }

  return (
    <>
      <IconButton ref={anchor} variant="ghost" size="sm" className={className} label={label} tooltip={tooltip} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close(false) : show())}>
        <Icon name="moreHorizontal" />
      </IconButton>
      {open && (
        <Popover anchor={anchor} align="end" minWidth={170} className="dropdown-menu" onClose={(reason) => close(reason === "escape")}>
          <div ref={list} className="dropdown-list" role="menu" aria-label={label} tabIndex={-1} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} onKeyDown={onKeyDown}>
            {items.map((item, i) => (
              <div
                key={item.label}
                id={`${id}-${i}`}
                role="menuitem"
                aria-disabled={item.disabled || undefined}
                data-tooltip={item.tooltip}
                className={["dropdown-option", i === active && "active", item.danger && "danger", item.disabled && "disabled"].filter(Boolean).join(" ")}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(item)}
              >
                <Icon name={item.icon} />
                <span className="dropdown-text">{item.label}</span>
              </div>
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
