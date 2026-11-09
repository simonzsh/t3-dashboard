import { ActionMenu } from "../../ui/index.ts";

interface Props {
  title: string;
  onEdit: () => void;
  onDelete: () => void;
}

/** The "…" button of a project row: a menu with Edit and Delete. */
export function ProjectMenu({ title, onEdit, onDelete }: Props) {
  return (
    <ActionMenu
      className="slist-new"
      label={`Project actions for ${title}`}
      items={[
        { label: "Edit project", icon: "pencil", onSelect: onEdit },
        { label: "Delete project", icon: "trash", onSelect: onDelete, danger: true },
      ]}
    />
  );
}
