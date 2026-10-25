import type { ReactNode } from "react";
import type { DashboardProject } from "../../shared/api.ts";

export interface DropdownOption {
  id: string;
  label: string;
  description?: string;
  icon?: ReactNode;
  group?: string;
}

// Above this count the list gets a filter field.
const FILTER_FROM = 9;

export const showsFilter = (count: number, filterable: boolean | undefined) => filterable ?? count >= FILTER_FROM;

export function filterOptions<O extends DropdownOption>(options: O[], query: string): O[] {
  const q = query.trim().toLowerCase();
  if (q === "") return options;
  return options.filter((o) => o.label.toLowerCase().includes(q) || (o.group?.toLowerCase().includes(q) ?? false));
}

/** Next active index after an arrow key; -1 (nothing active) enters from either end. */
export function moveActive(count: number, current: number, delta: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return delta === 1 ? 0 : count - 1;
  return (current + delta + count) % count;
}

export const projectOptions = (projects: DashboardProject[]): DropdownOption[] =>
  [...projects].sort((a, b) => a.title.localeCompare(b.title)).map((p) => ({ id: p.id, label: p.title }));
