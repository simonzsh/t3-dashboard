import type { ReactNode } from "react";
import { CountBadge } from "./CountBadge.tsx";
import { Icon, type IconName } from "./Icon.tsx";

interface Props {
  id: string;
  /** An icon name, or a brand mark that is not in the icon set. */
  icon: IconName | ReactNode;
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
      {typeof icon === "string" ? <Icon name={icon as IconName} /> : icon}
      <h2 id={id}>{title}</h2>
      {typeof note === "string" ? <span className="card-note" data-tooltip={note} data-tooltip-clipped>{note}</span> : note && <span className="card-note-menu">{note}</span>}
      {count !== undefined && <CountBadge count={count} />}
      {actions && <span className="card-actions">{actions}</span>}
    </div>
  );
}
