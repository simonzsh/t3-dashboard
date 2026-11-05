import { Children, useState, type ReactNode } from "react";
import { Button, Pressable } from "../../ui/index.ts";

interface SectionProps {
  id: string;
  title: string;
  count: number;
  /** Shown beside the heading, for a bulk action. */
  action?: ReactNode;
  headClass?: string;
  /** Rows shown before "Show N more". */
  limit?: number;
  children: ReactNode;
}

/** A list that shows `limit` rows, then a button for the rest. */
export function CappedList({ limit, children }: { limit?: number; children: ReactNode }) {
  const [all, setAll] = useState(false);
  const rows = Children.toArray(children);
  const hidden = limit === undefined || all ? 0 : Math.max(rows.length - limit, 0);
  return (
    <div className="inbox-list">
      {hidden > 0 ? rows.slice(0, limit) : rows}
      {hidden > 0 && (
        <Button variant="ghost" size="sm" className="inbox-more" onClick={() => setAll(true)}>
          Show {hidden} more
        </Button>
      )}
    </div>
  );
}

export function Section({ id, title, count, action, headClass, limit, children }: SectionProps) {
  if (count === 0) return null;
  return (
    <section className="inbox-section" aria-labelledby={id}>
      <div className="inbox-head">
        <h2 id={id} className={["inbox-heading", headClass].filter(Boolean).join(" ")}>
          {title} <span className="count">{count}</span>
        </h2>
        {action}
      </div>
      <CappedList limit={limit}>{children}</CappedList>
    </section>
  );
}

// Closed by default: these threads need no action from the user.
export function Collapsible({ title, count, className, limit, before, children }: { title: string; count: number; className?: string; limit?: number; before?: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <section className="inbox-section">
      <Pressable className={["inbox-collapse-head", className].filter(Boolean).join(" ")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className={`chevron${open ? " open" : ""}`} aria-hidden="true" />
        {title} ({count})
      </Pressable>
      {open && before}
      {open && <CappedList limit={limit}>{children}</CappedList>}
    </section>
  );
}
