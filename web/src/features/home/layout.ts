import type { Store } from "../../lib/storage.ts";

export const HOME_LAYOUT_KEY = "t3-dashboard-home-layout";

export const CARDS = ["usage", "notifications", "running", "up-next"] as const;
export type HomeCard = (typeof CARDS)[number];
export type Column = "left" | "right";

export const CARD_TITLES: Record<HomeCard, string> = { usage: "Usage", notifications: "Notifications", running: "Running", "up-next": "Up next" };

/** Two columns of ordered card ids, and the cards the user hid. */
export interface HomeLayout {
  left: HomeCard[];
  right: HomeCard[];
  hidden: HomeCard[];
}

export const DEFAULT_LAYOUT: HomeLayout = { left: ["usage", "running", "up-next"], right: ["notifications"], hidden: [] };
const DEFAULT_COLUMN: Record<HomeCard, Column> = { usage: "left", running: "left", "up-next": "left", notifications: "right" };

const isCard = (v: unknown): v is HomeCard => CARDS.includes(v as HomeCard);
const copy = (l: HomeLayout): HomeLayout => ({ left: [...l.left], right: [...l.right], hidden: [...l.hidden] });
const without = (l: HomeLayout, id: HomeCard): HomeLayout => ({ left: l.left.filter((c) => c !== id), right: l.right.filter((c) => c !== id), hidden: l.hidden.filter((c) => c !== id) });

/** Keeps known cards once each, and puts the missing ones back in their default column. */
export function validateLayout(raw: unknown): HomeLayout {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const seen = new Set<HomeCard>();
  const take = (value: unknown): HomeCard[] =>
    (Array.isArray(value) ? value : []).filter((id): id is HomeCard => {
      if (!isCard(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  const layout: HomeLayout = { left: take(input.left), right: take(input.right), hidden: take(input.hidden) };
  for (const id of CARDS) if (!seen.has(id)) layout[DEFAULT_COLUMN[id]].push(id);
  return layout;
}

/** Puts the card in a column at an index (the end when omitted); a hidden card becomes visible. */
export function moveCard(layout: HomeLayout, id: HomeCard, column: Column, index?: number): HomeLayout {
  const next = without(layout, id);
  next[column].splice(index ?? next[column].length, 0, id);
  return next;
}

/** Drops a card before the slot `index` of the layout as shown; the same layout when that changes nothing. */
export function dropCard(layout: HomeLayout, id: HomeCard, column: Column, index: number): HomeLayout {
  const from = layout[column].indexOf(id);
  if (from !== -1 && (index === from || index === from + 1)) return layout;
  // moveCard removes the card first: a lower slot in its own column shifts up by one.
  return moveCard(layout, id, column, from !== -1 && from < index ? index - 1 : index);
}

/** One step up (-1) or down (+1) inside its column. */
export function shiftCard(layout: HomeLayout, id: HomeCard, step: -1 | 1): HomeLayout {
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

export function columnOf(layout: HomeLayout, id: HomeCard): Column | null {
  return layout.left.includes(id) ? "left" : layout.right.includes(id) ? "right" : null;
}

export function setHidden(layout: HomeLayout, id: HomeCard, hide: boolean): HomeLayout {
  if (hide === layout.hidden.includes(id)) return layout;
  if (!hide) return moveCard(layout, id, DEFAULT_COLUMN[id]);
  return { ...without(layout, id), hidden: [...layout.hidden, id] };
}

/** One-column order on a phone: the first card, the right column, then the rest of the left one. */
export function stackedOrder(layout: HomeLayout): HomeCard[] {
  const [first, ...rest] = layout.left;
  return [...(first ? [first] : []), ...layout.right, ...rest];
}

export const isDefaultLayout = (layout: HomeLayout): boolean => JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT);

// Storage can throw (private mode): the default layout then applies.
export function loadLayout(storage: Store | null): HomeLayout {
  try {
    return validateLayout(JSON.parse(storage?.getItem(HOME_LAYOUT_KEY) ?? "null"));
  } catch {
    return validateLayout(null);
  }
}

export function saveLayout(storage: Store | null, layout: HomeLayout): void {
  try {
    storage?.setItem(HOME_LAYOUT_KEY, JSON.stringify(layout));
  } catch {
    // Ignored on purpose: see loadLayout.
  }
}
