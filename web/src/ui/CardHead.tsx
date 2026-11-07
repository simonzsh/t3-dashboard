import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon.tsx";

interface Props {
  id: string;
  icon: IconName;
  title: string;
  /** A muted word after the title, for what the whole card covers; a node (a menu) replaces the word and its tooltip. */
  note?: ReactNode;
  count?: number;
  /** Icon buttons on the right. */
  actions?: ReactNode;
}

export function CardHead({ id, icon, title, note, count, actions }: Props) {
  return (
    <div className="card-head">
      <Icon name={icon} />
      <h2 id={id}>{title}</h2>
      {typeof note === "string" ? <span className="card-note" data-tooltip={note} data-tooltip-clipped>{note}</span> : note && <span className="card-note-menu">{note}</span>}
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
      {actions && <span className="card-actions">{actions}</span>}
    </div>
  );
}
