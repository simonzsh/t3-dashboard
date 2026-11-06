import type { Store } from "../../lib/storage.ts";

export const DASHBOARD_LAYOUT_KEY = "t3-dashboard-layout";

export const CARDS = ["usage", "notifications", "running", "up-next"] as const;
export type DashboardCard = (typeof CARDS)[number];
export type Column = "left" | "right";

export const CARD_TITLES: Record<DashboardCard, string> = { usage: "Usage", notifications: "Notifications", running: "Running", "up-next": "Up next" };

/** Two columns of ordered card ids, and the cards the user hid. */
export interface DashboardLayout {
  left: DashboardCard[];
  right: DashboardCard[];
  hidden: DashboardCard[];
}

export const DEFAULT_LAYOUT: DashboardLayout = { left: ["usage", "running", "up-next"], right: ["notifications"], hidden: [] };
const DEFAULT_COLUMN: Record<DashboardCard, Column> = { usage: "left", running: "left", "up-next": "left", notifications: "right" };

const isCard = (v: unknown): v is DashboardCard => CARDS.includes(v as DashboardCard);
const copy = (l: DashboardLayout): DashboardLayout => ({ left: [...l.left], right: [...l.right], hidden: [...l.hidden] });
const without = (l: DashboardLayout, id: DashboardCard): DashboardLayout => ({ left: l.left.filter((c) => c !== id), right: l.right.filter((c) => c !== id), hidden: l.hidden.filter((c) => c !== id) });

/** Keeps known cards once each, and puts the missing ones back in their default column. */
export function validateLayout(raw: unknown): DashboardLayout {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<DashboardCard>();
  const take = (value: unknown): DashboardCard[] =>
    (Array.isArray(value) ? value : []).filter((id): id is DashboardCard => {
      if (!isCard(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const layout: DashboardLayout = { left: take(input.left), right: take(input.right), hidden: take(input.hidden) };
  for (const id of CARDS) if (!seen.has(id)) layout[DEFAULT_COLUMN[id]].push(id);
  return layout;
}

/** Puts the card in a column at an index (the end when omitted); a hidden card becomes visible. */
export function moveCard(layout: DashboardLayout, id: DashboardCard, column: Column, index?: number): DashboardLayout {
  const next = without(layout, id);
  next[column].splice(index ?? next[column].length, 0, id);
  return next;
}

/** Drops a card before the slot `index` of the layout as shown; the same layout when that changes nothing. */
export function dropCard(layout: DashboardLayout, id: DashboardCard, column: Column, index: number): DashboardLayout {
  const from = layout[column].indexOf(id);
  if (from !== -1 && (index === from || index === from + 1)) return layout;
  // moveCard removes the card first: a lower slot in its own column shifts up by one.
  return moveCard(layout, id, column, from !== -1 && from < index ? index - 1 : index);
}

/** One step up (-1) or down (+1) inside its column. */
export function shiftCard(layout: DashboardLayout, id: DashboardCard, step: -1 | 1): DashboardLayout {
  const column = columnOf(layout, id);
  if (!column) return layout;
  const at = layout[column].indexOf(id);
  const to = at + step;
  if (to < 0 || to >= layout[column].length) return layout;
  const next = copy(layout);
  next[column].splice(at, 1);
  next[column].splice(to, 0, id);
  return next;
}

export function columnOf(layout: DashboardLayout, id: DashboardCard): Column | null {
  return layout.left.includes(id) ? "left" : layout.right.includes(id) ? "right" : null;
}

export function setHidden(layout: DashboardLayout, id: DashboardCard, hide: boolean): DashboardLayout {
  if (hide === layout.hidden.includes(id)) return layout;
  if (!hide) return moveCard(layout, id, DEFAULT_COLUMN[id]);
  return { ...without(layout, id), hidden: [...layout.hidden, id] };
}

/** One-column order on a phone: the first card, the right column, then the rest of the left one. */
export function stackedOrder(layout: DashboardLayout): DashboardCard[] {
  const [first, ...rest] = layout.left;
  return [...(first ? [first] : []), ...layout.right, ...rest];
}

export const isDefaultLayout = (layout: DashboardLayout): boolean => JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT);

// Storage can throw (private mode): the default layout then applies.
export function loadLayout(storage: Store | null): DashboardLayout {
  try {
    return validateLayout(JSON.parse(storage?.getItem(DASHBOARD_LAYOUT_KEY) ?? "null"));
  } catch {
    return validateLayout(null);
  }
}

export function saveLayout(storage: Store | null, layout: DashboardLayout): void {
  try {
    storage?.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Ignored on purpose: see loadLayout.
  }
}
