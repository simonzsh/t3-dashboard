import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { Automation } from "../../../../shared/api.ts";
import { useCopy } from "../../lib/useCopy.ts";
import { Icon, IconButton, Popover, Pressable } from "../../ui/index.ts";
import { copyableUrl, isEditable } from "./automations.ts";

interface Props {
  automation: Automation;
  /** The row has no Edit button of its own, so its menu carries Edit; the sheet does not. */
  withEdit: boolean;
  onEdit: (a: Automation) => void;
  onDelete: (a: Automation) => void;
}

/** The "⋯" menu: Edit, Copy webhook URL and Delete. */
export function AutomationMenu({ automation: a, withEdit, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const { copy } = useCopy("copy the webhook URL");
  const url = copyableUrl(a);
  const items = () => [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)') ?? [])];

  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);

  function pick(action: () => void) {
    setOpen(false);
    action();
  }

  function close(reason: "escape" | "outside") {
    setOpen(false);
    if (reason === "escape") anchor.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    list[(at + (e.key === "ArrowDown" ? 1 : list.length - 1)) % list.length]?.focus();
  }

  return (
    <>
      <IconButton ref={anchor} variant="ghost" size="sm" label={`More actions for ${a.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="ellipsis" />
      </IconButton>
      {open && (
        <Popover anchor={anchor} align="end" minWidth={190} className="menu" role="menu" onClose={close}>
          <div ref={menu} className="menu-items" role="presentation" onKeyDown={onKeyDown}>
            {withEdit &&
              (isEditable(a) ? (
                <Pressable role="menuitem" className="menu-item" onClick={() => pick(() => onEdit(a))}>
                  <Icon name="pencil" />
                  Edit
                </Pressable>
              ) : (
                <span data-tooltip="This automation can't be edited here">
                  <Pressable role="menuitem" className="menu-item" disabled>
                    <Icon name="pencil" />
                    Edit
                  </Pressable>
                </span>
              ))}
            {url && (
              <Pressable role="menuitem" className="menu-item" onClick={() => pick(() => copy(url))}>
                <Icon name="copy" />
                Copy webhook URL
              </Pressable>
            )}
            <div className="menu-sep" role="separator" />
            <Pressable role="menuitem" className="menu-item danger" onClick={() => pick(() => onDelete(a))}>
              <Icon name="trash" />
              Delete
            </Pressable>
          </div>
        </Popover>
      )}
    </>
  );
}
