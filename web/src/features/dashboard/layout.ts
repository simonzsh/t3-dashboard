import { readJson, writeKey, type Store } from "../../lib/storage.ts";

export const DASHBOARD_LAYOUT_KEY = "t3-dashboard-layout";

const CARDS = ["activity", "usage", "up-next", "running", "server"] as const;
export type DashboardCard = (typeof CARDS)[number];

export const CARD_TITLES: Record<DashboardCard, string> = { usage: "Usage", server: "Server", activity: "Activity", running: "Running", "up-next": "Up next" };

export type CardWidth = "half" | "full";
export type CardColumn = "left" | "right";
export interface CardPlace {
  id: DashboardCard;
  width: CardWidth;
  column: CardColumn;
}

/** Shown cards in layout order, and the hidden ones. Stored as JSON under `t3-dashboard-layout`. */
export interface DashboardLayout {
  order: CardPlace[];
  hidden: DashboardCard[];
}

/** Derived, never stored: a full card alone, or a band of two independent stacks. */
export type LayoutRow = { kind: "full"; card: DashboardCard } | { kind: "band"; left: DashboardCard[]; right: DashboardCard[] };

export type DropTarget =
  /** In band `rows[row]`, before `stack[index]` (index = length: at the end). */
  | { kind: "column"; row: number; column: CardColumn; index: number }
  /** Before `rows[row]` (row = rows.length: at the end); the column only matters for a half card. */
  | { kind: "gap"; row: number; column: CardColumn };

const CARD_DEFAULTS: Record<DashboardCard, { width: CardWidth; column: CardColumn }> = {
  activity: { width: "full", column: "left" },
  usage: { width: "half", column: "left" },
  "up-next": { width: "half", column: "left" },
  running: { width: "half", column: "right" },
  server: { width: "half", column: "right" },
};
const defaultPlace = (id: DashboardCard): CardPlace => ({ id, ...CARD_DEFAULTS[id] });

// Internal rows keep the places, so a card's width and column survive a move.
type Row = { kind: "full"; place: CardPlace } | { kind: "band"; left: CardPlace[]; right: CardPlace[] };

/** Consecutive half cards form one band; each goes to the stack of its column. */
function rowsOf(order: CardPlace[]): Row[] {
  const rows: Row[] = [];
  for (const place of order) {
    if (place.width === "full") {
      rows.push({ kind: "full", place });
      continue;
    }
    let last = rows.at(-1);
    if (last?.kind !== "band") rows.push((last = { kind: "band", left: [], right: [] }));
    last[place.column].push(place);
  }
  return rows;
}
const flatten = (rows: Row[]): CardPlace[] => rows.flatMap((r) => (r.kind === "full" ? [r.place] : [...r.left, ...r.right]));
/** Canonical order: the rows rebuilt, so equal layouts have equal JSON and the DOM order is the reading order. */
const canon = (order: CardPlace[]): CardPlace[] => flatten(rowsOf(order));
const pruned = (rows: Row[]): Row[] => rows.filter((r) => r.kind === "full" || r.left.length + r.right.length > 0);

const sameOrder = (a: CardPlace[], b: CardPlace[]): boolean => a.length === b.length && a.every((p, i) => p.id === b[i]!.id && p.width === b[i]!.width && p.column === b[i]!.column);
/** The layout with this row list, or the same layout when the order does not change. */
function withRows(layout: DashboardLayout, rows: Row[]): DashboardLayout {
  const order = canon(flatten(rows));
  return sameOrder(order, layout.order) ? layout : { ...layout, order };
}

export const layoutRows = (layout: DashboardLayout): LayoutRow[] =>
  rowsOf(layout.order).map((r) => (r.kind === "full" ? { kind: "full", card: r.place.id } : { kind: "band", left: r.left.map((p) => p.id), right: r.right.map((p) => p.id) }));

export const DEFAULT_LAYOUT: DashboardLayout = { order: CARDS.map(defaultPlace), hidden: [] };

const isCard = (v: unknown): v is DashboardCard => CARDS.includes(v as DashboardCard);
// The default order saved before cards had a width: it becomes the default layout.
const LEGACY_ORDER: DashboardCard[] = ["usage", "activity", "server", "running", "up-next"];
const followsInOrder = (ids: DashboardCard[], reference: DashboardCard[]): boolean => {
  let from = 0;
  return ids.every((id) => {
    const at = reference.indexOf(id, from);
    from = at + 1;
    return at !== -1;
  });
};

/** Keeps known cards once each, fills in the card defaults, and appends the missing cards. A stored value of another shape gives the default. */
export function validateLayout(raw: unknown): DashboardLayout {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  if (!Array.isArray(input.order)) return DEFAULT_LAYOUT;
  const seen = new Set<DashboardCard>();
  const order: CardPlace[] = [];
  for (const entry of input.order) {
    const item = (entry && typeof entry === "object" ? entry : { id: entry }) as Record<string, unknown>;
    if (!isCard(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const base = defaultPlace(item.id);
    order.push({ id: item.id, width: item.width === "half" || item.width === "full" ? item.width : base.width, column: item.column === "left" || item.column === "right" ? item.column : base.column });
  }
  const hidden = (Array.isArray(input.hidden) ? input.hidden : []).filter((id, i, all): id is DashboardCard => isCard(id) && !seen.has(id) && all.indexOf(id) === i);
  const ids = order.map((p) => p.id);
  if (input.order.every((e) => typeof e === "string") && followsInOrder(ids, LEGACY_ORDER)) {
    return { order: DEFAULT_LAYOUT.order.filter((p) => !hidden.includes(p.id)), hidden };
  }
  const missing = CARDS.filter((id) => !seen.has(id) && !hidden.includes(id)).map(defaultPlace);
  return { order: canon([...order, ...missing]), hidden };
}

/** Where a half card's gap target touches a band, it lands in that band: the target becomes the matching column target. */
export function resolveDrop(layout: DashboardLayout, id: DashboardCard, target: DropTarget): DropTarget {
  if (target.kind !== "gap" || layout.order.find((p) => p.id === id)?.width !== "half") return target;
  const rows = layoutRows(layout);
  const at = rows[target.row];
  if (at?.kind === "band") return { kind: "column", row: target.row, column: target.column, index: 0 };
  const before = rows[target.row - 1];
  if (before?.kind === "band") return { kind: "column", row: target.row - 1, column: target.column, index: before[target.column].length };
  return target;
}

/** Drops a card at a target of the layout as shown; the same layout when that changes nothing. */
export function dropCard(layout: DashboardLayout, id: DashboardCard, target: DropTarget): DashboardLayout {
  const place = layout.order.find((p) => p.id === id);
  if (!place || (place.width === "full" && target.kind === "column")) return layout;
  const t = resolveDrop(layout, id, target);
  const rows = rowsOf(layout.order);
  // The marker stands for the card at its target; the original is removed afterwards.
  const marker: CardPlace = place.width === "full" ? { ...place } : { ...place, column: t.column };
  if (t.kind === "column") {
    const band = rows[t.row];
    if (band?.kind !== "band") return layout;
    band[t.column].splice(t.index, 0, marker);
  } else {
    const row: Row = place.width === "full" ? { kind: "full", place: marker } : { kind: "band", left: [], right: [] };
    if (row.kind === "band") row[t.column].push(marker);
    rows.splice(t.row, 0, row);
  }
  const strip = (list: CardPlace[]) => list.filter((p) => p === marker || p.id !== id);
  const kept = rows
    .filter((r) => r.kind !== "full" || r.place === marker || r.place.id !== id)
    .map((r): Row => (r.kind === "full" ? r : { kind: "band", left: strip(r.left), right: strip(r.right) }));
  return withRows(layout, pruned(kept));
}

/** Takes the card out of its band; returns the index of that band, or -1 for a full card. */
const leaveBand = (rows: Row[], id: DashboardCard): number => {
  const r = rows.findIndex((row) => row.kind === "band" && [...row.left, ...row.right].some((p) => p.id === id));
  const band = rows[r];
  if (band?.kind === "band") {
    band.left = band.left.filter((p) => p.id !== id);
    band.right = band.right.filter((p) => p.id !== id);
  }
  return r;
};

/** One step up (-1) or down (+1); the same layout when the card is hidden or cannot move. */
export function shiftCard(layout: DashboardLayout, id: DashboardCard, step: -1 | 1): DashboardLayout {
  const place = layout.order.find((p) => p.id === id);
  if (!place) return layout;
  const rows = rowsOf(layout.order);
  if (place.width === "full") {
    const r = rows.findIndex((row) => row.kind === "full" && row.place.id === id);
    if (r + step < 0 || r + step >= rows.length) return layout;
    [rows[r], rows[r + step]] = [rows[r + step]!, rows[r]!];
    return withRows(layout, rows);
  }
  const r = rows.findIndex((row) => row.kind === "band" && row[place.column].some((p) => p.id === id));
  const band = rows[r];
  if (band?.kind !== "band") return layout;
  const stack = band[place.column];
  const i = stack.findIndex((p) => p.id === id);
  if (i + step >= 0 && i + step < stack.length) {
    [stack[i], stack[i + step]] = [stack[i + step]!, stack[i]!];
    return withRows(layout, rows);
  }
  // At the edge of its stack: the card moves past the full card next to the band, into a band of its own.
  if (!rows[r + step]) return layout;
  leaveBand(rows, id);
  rows.splice(step === -1 ? r - 1 : r + 2, 0, { kind: "band", left: place.column === "left" ? [place] : [], right: place.column === "right" ? [place] : [] });
  return withRows(layout, pruned(rows));
}

/** Half to full: the card leaves its band and takes a row right after it. Full to half: it stays at its place in the order. */
export function toggleWidth(layout: DashboardLayout, id: DashboardCard): DashboardLayout {
  const place = layout.order.find((p) => p.id === id);
  if (!place) return layout;
  if (place.width === "full") return withRows(layout, rowsOf(layout.order.map((p) => (p === place ? { ...p, width: "half" } : p))));
  const rows = rowsOf(layout.order);
  const r = leaveBand(rows, id);
  rows.splice(r + 1, 0, { kind: "full", place: { ...place, width: "full" } });
  return withRows(layout, pruned(rows));
}

/** Hiding takes the card out of the order. Showing puts it back with its default place, at the end. */
export function setHidden(layout: DashboardLayout, id: DashboardCard, hide: boolean): DashboardLayout {
  if (hide === layout.hidden.includes(id)) return layout;
  if (hide) return { order: canon(layout.order.filter((p) => p.id !== id)), hidden: [...layout.hidden, id] };
  return { order: canon([...layout.order, defaultPlace(id)]), hidden: layout.hidden.filter((c) => c !== id) };
}

export const isDefaultLayout = (layout: DashboardLayout): boolean => JSON.stringify(layout) === JSON.stringify(DEFAULT_LAYOUT);

// Anything unexpected in storage gives the default layout.
export const loadLayout = (storage: Store | null): DashboardLayout => validateLayout(readJson(storage, DASHBOARD_LAYOUT_KEY));

export const saveLayout = (storage: Store | null, layout: DashboardLayout): void => writeKey(storage, DASHBOARD_LAYOUT_KEY, JSON.stringify(layout));
