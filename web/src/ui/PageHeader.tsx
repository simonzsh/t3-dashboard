import type { ReactNode, Ref } from "react";

interface Props {
  title: string;
  description: string;
  /** Shown before the title: the logo on a phone. */
  leading?: ReactNode;
  /** At most three controls. */
  actions?: ReactNode;
  ref?: Ref<HTMLElement>;
}

export function PageHeader({ title, description, leading, actions, ref }: Props) {
  return (
    <header className="page-header" ref={ref}>
      {leading}
      <div className="page-heading">
        <h1 className="page-title">{title}</h1>
        <p className="page-description">{description}</p>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}
