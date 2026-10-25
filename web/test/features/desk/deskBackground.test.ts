import { test } from "bun:test";
import assert from "node:assert/strict";
import {
  BACKGROUND_KEY,
  BACKGROUND_PRESETS,
  MAX_IMAGE_CHARS,
  fitWithin,
  loadBackground,
  parseBackground,
  saveBackground,
} from "../../../src/features/desk/deskBackground.ts";
import { memoryStore } from "../../fixtures.ts";


test("presets offer None plus nine distinct gradients", () => {
  assert.equal(BACKGROUND_PRESETS[0]?.id, "none");
  assert.equal(BACKGROUND_PRESETS.length - 1, 9);
});

test("parseBackground accepts known values and falls back to none", () => {
  assert.deepEqual(parseBackground(JSON.stringify({ kind: "preset", id: "ocean" })), { kind: "preset", id: "ocean" });
  assert.deepEqual(parseBackground(JSON.stringify({ kind: "preset", id: "clay" })), { kind: "preset", id: "sand" });
  assert.deepEqual(parseBackground(JSON.stringify({ kind: "image", dataUrl: "data:image/jpeg;base64,AAAA" })), { kind: "image", dataUrl: "data:image/jpeg;base64,AAAA" });
  assert.deepEqual(parseBackground(JSON.stringify({ kind: "preset", id: "neon" })), { kind: "none" });
  assert.deepEqual(parseBackground(JSON.stringify({ kind: "image", dataUrl: "https://example.com/x.png" })), { kind: "none" });
  assert.deepEqual(parseBackground("{oops"), { kind: "none" });
  assert.deepEqual(parseBackground(null), { kind: "none" });
});

test("fitWithin keeps the ratio and never upscales", () => {
  assert.deepEqual(fitWithin(3840, 2160, 1920), { width: 1920, height: 1080 });
  assert.deepEqual(fitWithin(1000, 4000, 1920), { width: 480, height: 1920 });
  assert.deepEqual(fitWithin(800, 600, 1920), { width: 800, height: 600 });
});

test("saveBackground stores the value and loadBackground reads it", () => {
  const s = memoryStore();
  assert.equal(saveBackground(s, { kind: "preset", id: "forest" }), null);
  assert.ok(s.data.has(BACKGROUND_KEY));
  assert.deepEqual(loadBackground(s), { kind: "preset", id: "forest" });
});

test("saveBackground refuses an image that is too large or that storage rejects", () => {
  const s = memoryStore();
  const big = `data:image/jpeg;base64,${"A".repeat(MAX_IMAGE_CHARS)}`;
  assert.match(saveBackground(s, { kind: "image", dataUrl: big }) ?? "", /too large/i);
  assert.equal(s.data.size, 0);
  const full = { getItem: () => null, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.match(saveBackground(full, { kind: "image", dataUrl: "data:image/jpeg;base64,AAAA" }) ?? "", /too large/i);
  const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => {} };
  assert.deepEqual(loadBackground(broken), { kind: "none" });
});
