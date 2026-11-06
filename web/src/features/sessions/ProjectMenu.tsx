import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon, IconButton, Popover, Pressable } from "../../ui/index.ts";

interface Props {
  title: string;
  onEdit: () => void;
  onDelete: () => void;
}

/** The "…" button of a project row: a menu with Edit and Delete. */
export function ProjectMenu({ title, onEdit, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const items = () => Array.from(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  // The menu is a portal: move the focus into it, so Tab and the arrows reach its items.
  useEffect(() => {
    if (open) items()[0]?.focus();
  }, [open]);
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Tab") return setOpen(false);
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    all[(at + (e.key === "ArrowDown" ? 1 : all.length - 1)) % all.length]?.focus();
  }
  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <>
      <IconButton ref={anchor} variant="ghost" size="sm" className="slist-new" label={`Project actions for ${title}`} tooltip="Project actions" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Icon name="moreHorizontal" />
      </IconButton>
      {open && (
        <Popover anchor={anchor} align="end" minWidth={170} role="menu" className="project-menu" onClose={(reason) => {
          setOpen(false);
          if (reason === "escape") anchor.current?.focus();
        }}>
          <div ref={list} onKeyDown={onKey}>
            <Pressable role="menuitem" className="project-menu-item" onClick={pick(onEdit)}>
              <Icon name="pencil" />
              Edit project…
            </Pressable>
            <Pressable role="menuitem" className="project-menu-item danger" onClick={pick(onDelete)}>
              <Icon name="trash" />
              Delete project…
            </Pressable>
          </div>
        </Popover>
      )}
    </>
  );
}
