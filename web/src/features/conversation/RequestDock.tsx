import type { ReactNode } from "react";
import { Chevron, IconButton } from "../../ui/index.ts";

/** Shared frame for requests attached to the composer. */
export function RequestDock({ title, label, collapsed, onToggle, actions, children }: {
  title: ReactNode;
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={`question-dock${collapsed ? " collapsed" : ""}`} aria-label={label}>
      <header className="question-dock-head">
        <span className="question-dock-title">{title}</span>
        {actions}
        <IconButton label={collapsed ? "Show the request" : "Hide the request"} variant="ghost" size="sm" aria-expanded={!collapsed} onClick={onToggle}>
          <Chevron open={!collapsed} opensUp />
        </IconButton>
      </header>
      {!collapsed && <div className="question-dock-body">{children}</div>}
    </section>
  );
}
