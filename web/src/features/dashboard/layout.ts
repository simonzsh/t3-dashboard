import { readJson, writeKey, type Store } from "../../lib/storage.ts";

export const DASHBOARD_LAYOUT_KEY = "t3-dashboard-layout";

const CARDS = ["usage", "activity", "server", "running", "up-next"] as const;
export type DashboardCard = (typeof CARDS)[number];

export const CARD_TITLES: Record<DashboardCard, string> = { usage: "Usage", server: "Server", activity: "Activity", running: "Running", "up-next": "Up next" };

/** One ordered list of the shown cards, and the cards the user hid. */
export interface DashboardLayout {
  order: DashboardCard[];
  hidden: DashboardCard[];
}

export const DEFAULT_LAYOUT: DashboardLayout = { order: [...CARDS], hidden: [] };

const isCard = (v: unknown): v is DashboardCard => CARDS.includes(v as DashboardCard);
const without = (l: DashboardLayout, id: DashboardCard): DashboardLayout => ({ order: l.order.filter((c) => c !== id), hidden: l.hidden.filter((c) => c !== id) });

/** Keeps known cards once each, and appends the missing ones to the order. A stored value of another shape gives the default. */
export function validateLayout(raw: unknown): DashboardLayout {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(input.order)) return DEFAULT_LAYOUT;
  const seen = new Set<DashboardCard>();
  const take = (value: unknown): DashboardCard[] =>
    (Array.isArray(value) ? value : []).filter((id): id is DashboardCard => {
      if (!isCard(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const order = take(input.order);
  const hidden = take(input.hidden);
  return { order: [...order, ...CARDS.filter((id) => !seen.has(id))], hidden };
}

/** Puts the card at an index of the order (the end when omitted); a hidden card becomes visible. */
export function moveCard(layout: DashboardLayout, id: DashboardCard, index?: number): DashboardLayout {
  const next = without(layout, id);
  next.order.splice(index ?? next.order.length, 0, id);
  return next;
}

/** Drops a card before the slot `index` of the layout as shown; the same layout when that changes nothing. */
export function dropCard(layout: DashboardLayout, id: DashboardCard, index: number): DashboardLayout {
  const from = layout.order.indexOf(id);
  if (from !== -1 && (index === from || index === from + 1)) return layout;
  // moveCard removes the card first: a lower slot shifts up by one.
  return moveCard(layout, id, from !== -1 && from < index ? index - 1 : index);
}

/** One step up (-1) or down (+1); the same layout at the ends or when the card is hidden. */
export function shiftCard(layout: DashboardLayout, id: DashboardCard, step: -1 | 1): DashboardLayout {
  const from = layout.order.indexOf(id);
  const to = from + step;
  return from === -1 || to < 0 || to >= layout.order.length ? layout : moveCard(layout, id, to);
}

export function setHidden(layout: DashboardLayout, id: DashboardCard, hide: boolean): DashboardLayout {
  if (hide === layout.hidden.includes(id)) return layout;
  if (!hide) return moveCard(layout, id);
  return { ...without(layout, id), hidden: [...layout.hidden, id] };
}

export const isDefaultLayout = (layout: DashboardLayout): boolean => JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT);

// Anything unexpected in storage gives the default layout.
export const loadLayout = (storage: Store | null): DashboardLayout => validateLayout(readJson(storage, DASHBOARD_LAYOUT_KEY));

export const saveLayout = (storage: Store | null, layout: DashboardLayout): void => writeKey(storage, DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
