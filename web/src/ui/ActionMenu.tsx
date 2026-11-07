import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon.tsx";
import { IconButton } from "./IconButton.tsx";
import { Popover } from "./Popover.tsx";
import { Pressable } from "./Pressable.tsx";

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

/** The "…" button of a row, and the menu of actions that it opens. */
export function ActionMenu({ label, tooltip, items, className }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const enabled = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? []);
  // The menu is a portal: move the focus into it, so Tab and the arrows reach its items.
  useEffect(() => {
    if (open) enabled()[0]?.focus();
  }, [open]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab") return setOpen(false);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = enabled();
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
  }
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <>
      <IconButton ref={anchor} variant="ghost" size="sm" className={className} label={label} tooltip={tooltip} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="moreHorizontal" />
      </IconButton>
      {open && (
        <Popover anchor={anchor} align="end" minWidth={170} role="menu" className="project-menu" onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") anchor.current?.focus();
        }}>
          <div ref={list} onKeyDown={onKey}>
            {items.map((item) => {
              const button = (
                <Pressable role="menuitem" className={`project-menu-item${item.danger ? " danger" : ""}`} disabled={item.disabled} onClick={pick(item.onSelect)}>
                  <Icon name={item.icon} />
                  {item.label}
                </Pressable>
              );
              // A disabled button gets no hover events: the wrapper carries the tooltip.
              return (
                <span key={item.label} data-tooltip={item.tooltip}>
                  {button}
                </span>
              );
            })}
          </div>
        </Popover>
      )}
    </>
  );
}
