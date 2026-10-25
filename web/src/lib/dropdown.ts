import type { ReactNode } from "react";
import type { DashboardProject } from "../../../shared/api.ts";

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

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Placement {
  left: number;
  top: number;
  minWidth: number;
  /** Set only when the menu fits on neither side. */
  maxHeight?: number;
  above: boolean;
}

interface PlaceOptions {
  align: "start" | "end";
  minWidth: number;
  matchWidth: boolean;
  gap?: number;
  margin?: number;
}

/** Fixed position of a menu next to its trigger: below by default, above when there is no room, always inside the viewport. */
export function placeMenu(anchor: Box, menu: { width: number; height: number }, view: { width: number; height: number }, o: PlaceOptions): Placement {
  const gap = o.gap ?? 4;
  const margin = o.margin ?? 8;
  const minWidth = o.matchWidth ? Math.max(o.minWidth, anchor.width) : o.minWidth;
  const width = Math.max(menu.width, minWidth);
  const below = view.height - margin - (anchor.top + anchor.height + gap);
  const aboveRoom = anchor.top - gap - margin;
  const above = menu.height > below && aboveRoom > below;
  const room = above ? aboveRoom : below;
  const height = Math.min(menu.height, Math.max(room, 0));
  const top = above ? anchor.top - gap - height : anchor.top + anchor.height + gap;
  const start = o.align === "end" ? anchor.left + anchor.width - width : anchor.left;
  const left = Math.max(margin, Math.min(start, view.width - margin - width));
  return { left, top, minWidth, above, ...(menu.height > room && { maxHeight: room }) };
}
