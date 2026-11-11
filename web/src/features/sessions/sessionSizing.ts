import type { SessionLayout } from "../../lib/sessionLayout.ts";

type Pane = { slot: number } | Group;
interface Group { key: string; axis: "x" | "y"; children: Pane[]; weights?: number[] }
export type PaneSizes = Readonly<Record<string, readonly number[]>>;
export interface Rect { x: number; y: number; width: number; height: number }
export interface Divider { key: string; index: number; axis: "x" | "y"; rect: Rect; extent: number; weights: number[]; minimums: number[] }
export interface Tile extends Rect { slot: number }

function tree(count: number, layout: SessionLayout): Pane {
  const leaf = (slot: number): Pane => ({ slot });
  const group = (key: string, slots: number[]): Group => ({ key, axis: "x", children: slots.map(leaf) });
  if (layout === "columns" || count < 2) return group("columns", Array.from({ length: count }, (_, i) => i));
  const pairs = Math.floor(count / 2);
  const rows: Group = { key: "rows", axis: "y", children: [
    group("top", Array.from({ length: pairs }, (_, i) => i * 2)),
    group("bottom", Array.from({ length: pairs }, (_, i) => i * 2 + 1)),
  ] };
  return count % 2 ? { key: "outer", axis: "x", children: [rows, leaf(count - 1)], weights: [pairs, 1] } : rows;
}

function minimum(pane: Pane, axis: "x" | "y"): number {
  if ("slot" in pane) return axis === "x" ? 240 : 120;
  const values = pane.children.map(child => minimum(child, axis));
  return pane.axis === axis ? values.reduce((a, b) => a + b, 0) : Math.max(...values);
}

export function paneLayout(count: number, layout: SessionLayout, sizes: PaneSizes) {
  const tiles: Tile[] = [];
  const dividers: Divider[] = [];
  function visit(pane: Pane, rect: Rect) {
    if ("slot" in pane) { tiles.push({ ...rect, slot: pane.slot }); return; }
    const key = `${layout}:${count}:${pane.key}`;
    const weights = [...(sizes[key] ?? pane.weights ?? pane.children.map(() => 1))];
    const total = weights.reduce((a, b) => a + b, 0);
    const extent = pane.axis === "x" ? rect.width : rect.height;
    let offset = 0;
    pane.children.forEach((child, index) => {
      const length = extent * weights[index]! / total;
      const box = pane.axis === "x"
        ? { ...rect, x: rect.x + offset, width: length }
        : { ...rect, y: rect.y + offset, height: length };
      visit(child, box);
      if (index < pane.children.length - 1) dividers.push({
        key, index, axis: pane.axis, rect: box, extent, weights,
        minimums: pane.children.map(child => minimum(child, pane.axis)),
      });
      offset += length;
    });
  }
  if (count) visit(tree(count, layout), { x: 0, y: 0, width: 1, height: 1 });
  return { tiles, dividers };
}

export function resizePanes(sizes: PaneSizes, divider: Divider, delta: number, pixels: number, reset = false): PaneSizes {
  if (pixels <= 0) return sizes;
  const weights = [...(sizes[divider.key] ?? divider.weights)];
  const i = divider.index;
  const total = weights.reduce((a, b) => a + b, 0);
  const pair = weights[i]! + weights[i + 1]!;
  const scale = total / (pixels * divider.extent);
  const low = divider.minimums[i]! * scale;
  const high = pair - divider.minimums[i + 1]! * scale;
  if (low > high) return sizes;
  const next = Math.max(low, Math.min(high, reset ? pair / 2 : weights[i]! + delta * scale));
  weights[i] = next;
  weights[i + 1] = pair - next;
  return { ...sizes, [divider.key]: weights };
}

const rounded = (n: number) => Math.round(n * 1e8) / 1e8;

// Flat DOM children preserve conversation state when panes move between groups.
export function paneGrid(tiles: Tile[]) {
  const xs = [...new Set(tiles.flatMap(t => [rounded(t.x), rounded(t.x + t.width)]))].sort((a, b) => a - b);
  const ys = [...new Set(tiles.flatMap(t => [rounded(t.y), rounded(t.y + t.height)]))].sort((a, b) => a - b);
  const tracks = (values: number[]) => values.slice(1).map((v, i) => `minmax(0, ${v - values[i]!}fr)`).join(" ");
  return {
    gridTemplateColumns: tracks(xs), gridTemplateRows: tracks(ys),
    position: (rect: Rect) => ({
      gridColumn: `${xs.indexOf(rounded(rect.x)) + 1} / ${xs.indexOf(rounded(rect.x + rect.width)) + 1}`,
      gridRow: `${ys.indexOf(rounded(rect.y)) + 1} / ${ys.indexOf(rounded(rect.y + rect.height)) + 1}`,
    }),
  };
}
