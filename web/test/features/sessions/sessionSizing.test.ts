import assert from "node:assert/strict";
import { test } from "bun:test";
import { paneLayout, paneGrid, resizePanes, type Tile } from "../../../src/features/sessions/sessionSizing.ts";

function tiled(tiles: Tile[]) {
  assert.ok(Math.abs(tiles.reduce((sum, t) => sum + t.width * t.height, 0) - 1) < 1e-7);
  for (const a of tiles) {
    assert.ok(a.width > 0 && a.height > 0);
    for (const b of tiles) {
      if (a.slot >= b.slot) continue;
      const overlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const vertical = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      assert.ok(overlap < 1e-7 || vertical < 1e-7, "panels must not overlap");
    }
  }
}

test("a horizontal resize changes only the two adjacent windows in its row", () => {
  const before = paneLayout(6, "grid", {});
  const divider = before.dividers.find(d => d.key.endsWith(":bottom") && d.index === 0)!;
  const sizes = resizePanes({}, divider, 100, 1500);
  const after = paneLayout(6, "grid", sizes);
  for (const slot of [0, 2, 4, 5]) assert.deepEqual(after.tiles.find(t => t.slot === slot), before.tiles.find(t => t.slot === slot));
  assert.ok(after.tiles.find(t => t.slot === 1)!.width > before.tiles.find(t => t.slot === 1)!.width);
  assert.ok(after.tiles.find(t => t.slot === 3)!.width < before.tiles.find(t => t.slot === 3)!.width);
  tiled(after.tiles);
  const grid = paneGrid(after.tiles);
  for (const tile of after.tiles) assert.doesNotMatch(JSON.stringify(grid.position(tile)), /0 \//);
});

test("nested groups cover the strip after resizing, resetting, opening and closing", () => {
  for (const layout of ["grid", "columns"] as const) for (const count of [1, 2, 3, 4, 5, 8, 20]) {
    let sizes = {};
    const initial = paneLayout(count, layout, sizes);
    tiled(initial.tiles);
    for (const divider of initial.dividers) {
      const pixels = divider.axis === "x" ? Math.ceil(count / (layout === "grid" ? 2 : 1)) * 500 : 900;
      sizes = resizePanes(sizes, divider, 100000, pixels);
      tiled(paneLayout(count, layout, sizes).tiles);
      sizes = resizePanes(sizes, divider, 0, pixels, true);
      tiled(paneLayout(count, layout, sizes).tiles);
    }
    tiled(paneLayout(count + 1, layout, sizes).tiles);
  }
});

test("minimum widths clamp the drag and unmeasured panes stay unchanged", () => {
  const divider = paneLayout(2, "columns", {}).dividers[0]!;
  const sizes = resizePanes({}, divider, 9999, 760);
  const tiles = paneLayout(2, "columns", sizes).tiles;
  assert.ok(Math.abs(tiles[1]!.width * 760 - 240) < 1e-7);
  assert.deepEqual(resizePanes({}, divider, 100, 0), {});
});
