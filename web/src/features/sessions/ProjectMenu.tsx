import { useRef, useState } from "react";
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
          <Pressable role="menuitem" className="project-menu-item" onClick={pick(onEdit)}>
            <Icon name="pencil" />
            Edit project…
          </Pressable>
          <Pressable role="menuitem" className="project-menu-item danger" onClick={pick(onDelete)}>
            <Icon name="trash" />
            Delete project…
          </Pressable>
        </Popover>
      )}
    </>
  );
}
