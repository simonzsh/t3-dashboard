import type { ReactNode } from "react";
import { Icon, type IconName } from "../../ui/index.ts";

interface Props {
  id: string;
  icon: IconName;
  title: string;
  count?: number;
  /** Icon buttons on the right. */
  actions?: ReactNode;
}

export function CardHead({ id, icon, title, count, actions }: Props) {
  return (
    <div className="card-head">
      <Icon name={icon} />
      <h2 id={id}>{title}</h2>
      {count !== undefined && count > 0 && <span className="count">{count}</span>}
      {actions && <span className="card-actions">{actions}</span>}
    </div>
  );
}
