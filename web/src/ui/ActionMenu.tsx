import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Button, type ButtonVariant } from "./Button.tsx";
import { CountBadge } from "./CountBadge.tsx";
import { Icon, type IconName } from "./Icon.tsx";
import { IconButton } from "./IconButton.tsx";
import { Popover } from "./Popover.tsx";
import { useListNav } from "./useListNav.ts";

export interface ActionMenuItem {
  label: string;
  icon: IconName;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Says why an item is disabled. */
  tooltip?: string;
  /** A hollow ring after the label, the unread mark of the dashboard. */
  unread?: boolean;
}

interface RowProps {
  item: ActionMenuItem;
  id: string;
  active: boolean;
  onPick: () => void;
  onHover: () => void;
}

// A row of its own: the menu is in a portal, so only a row can be rendered statically in a test.
export function ActionMenuRow({ item, id, active, onPick, onHover }: RowProps) {
  return (
    <div
      id={id}
      role="menuitem"
      aria-disabled={item.disabled || undefined}
      data-tooltip={item.tooltip}
      className={["dropdown-option", active && "active", item.danger && "danger", item.disabled && "disabled"].filter(Boolean).join(" ")}
      onMouseDown={(e) => e.preventDefault()}
      onMouseEnter={onHover}
      onClick={onPick}
    >
      <Icon name={item.icon} />
      <span className="dropdown-text">{item.label}</span>
      {item.unread && <span className="notif-dot" role="img" aria-label="Unread" />}
    </div>
  );
}

interface Props {
  /** Accessible name of the "…" button. */
  label: string;
  tooltip?: string;
  items: ActionMenuItem[];
  /** Extra classes on the "…" button. */
  className?: string;
  /** The trigger's icon, "…" by default. */
  icon?: IconName;
  /** A count badge on the icon's corner: the trigger keeps the exact size of the icon buttons beside it. */
  count?: number;
  /** Visible text after the icon: the trigger is then a text button. */
  text?: string;
  /** The text button's look, as a `Button` next to it. */
  variant?: ButtonVariant;
}

/** The "…" button of a row, and its menu of actions. Same menu, rows and keys as the Dropdown. */
export function ActionMenu({ label, tooltip, items, className, icon = "moreHorizontal", count, text, variant = "ghost" }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const { active, setActive, hover, onKeyDown: navKeyDown } = useListNav(items.length, {
    space: true,
    onPick: (i) => pick(items[i]!),
    itemId: (i) => `${id}-${i}`,
  });

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
    if (!navKeyDown(e) && e.key === "Tab") close(false);
  }

  return (
    <>
      {text === undefined ? (
        <IconButton ref={anchor} variant="ghost" size="sm" className={className} label={label} tooltip={tooltip} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close(false) : show())}>
          <Icon name={icon} />
          {count !== undefined && <CountBadge count={count} max={9} hidden className="icon-button-count" />}
        </IconButton>
      ) : (
        <Button ref={anchor} variant={variant} size="sm" className={className} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => (open ? close(false) : show())}>
          <Icon name={icon} /> {text}
        </Button>
      )}
      {open && (
        <Popover anchor={anchor} align="end" minWidth={170} className="dropdown-menu" onClose={(reason) => close(reason === "escape")}>
          <div ref={list} className="dropdown-list" role="menu" aria-label={label} tabIndex={-1} aria-activedescendant={active >= 0 ? `${id}-${active}` : undefined} onKeyDown={onKeyDown}>
            {items.map((item, i) => (
              <ActionMenuRow key={item.label} item={item} id={`${id}-${i}`} active={i === active} onPick={() => pick(item)} onHover={() => hover(i)} />
            ))}
          </div>
        </Popover>
      )}
    </>
  );
}
