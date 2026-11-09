import type { ReactNode } from "react";
import { SearchField } from "./SearchField.tsx";

interface Props {
  /** The search field comes first. Its placeholder is the label with "…". */
  search: { label: string; value: string; onChange: (value: string) => void };
  /** False keeps one row: the search field shrinks and the other items keep their size (a narrow list). */
  wrap?: boolean;
  /** Filters and actions after the search field. */
  children?: ReactNode;
}

// No className: pages must not style the shared toolbar on their own (web/test/uiRules.test.ts).
export function ListToolbar({ search, wrap = true, children }: Props) {
  return (
    <div className={wrap ? "list-toolbar" : "list-toolbar no-wrap"}>
      <SearchField className="list-toolbar-search" aria-label={search.label} placeholder={`${search.label}…`} value={search.value} onChange={(e) => search.onChange(e.target.value)} />
      {children}
    </div>
  );
}
