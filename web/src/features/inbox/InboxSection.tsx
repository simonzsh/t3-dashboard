import { Children, useState, type ReactNode } from "react";
import { Button } from "../../ui/index.ts";

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
