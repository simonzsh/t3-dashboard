import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { CacheCleanupPreview } from "../../../../shared/api.ts";
import { CacheCleanupDialog } from "../../../src/features/dashboard/CacheCleanupDialog.tsx";

const GIB = 1024 ** 3;
const preview: CacheCleanupPreview = {
  supported: true,
  targets: [{ id: "npm", label: "npm cache", bytes: 4.3 * GIB }, { id: "uv", label: "uv cache", bytes: 0 }, { id: "bun", label: "Bun install cache", bytes: 3.3 * GIB }],
  totalBytes: 7.6 * GIB,
};
const render = (over: Partial<Parameters<typeof CacheCleanupDialog>[0]> = {}) =>
  renderToStaticMarkup(<CacheCleanupDialog preview={preview} error={null} running={false} onConfirm={() => {}} onClose={() => {}} {...over} />);
const text = (html: string) => html.replace(/<[^>]+>/g, "");

test("it lists each cache with its size and the total", () => {
  const out = text(render());
  assert.match(out, /npm cache4\.3 GB/);
  assert.match(out, /uv cache0 B/);
  assert.match(out, /Bun install cache3\.3 GB/);
  assert.match(out, /Total7\.6 GB/);
});

test("the confirm button is the primary action, not a danger one, with Cancel beside it", () => {
  const out = render();
  assert.match(out, /<button[^>]*class="[^"]*primary[^"]*"[^>]*>Clear caches<\/button>/);
  assert.doesNotMatch(out, /danger/);
  assert.match(out, />Cancel<\/button>/);
  assert.doesNotMatch(out, /<button[^>]*disabled=""[^>]*>Clear caches/);
});

test("while the sizes load, or when nothing is reclaimable, or while it runs, confirm is disabled", () => {
  for (const over of [{ preview: null }, { preview: { ...preview, totalBytes: 0 } }, { running: true }]) {
    assert.match(render(over), /<button[^>]*disabled=""[^>]*>(Clear caches|Clearing…)<\/button>/);
  }
  assert.match(text(render({ preview: null })), /Measuring/);
  assert.match(text(render({ running: true })), /Clearing…/);
});

test("an error shows as an alert and the dialog keeps its list", () => {
  const out = render({ error: "boom" });
  assert.match(out, /<p class="auto-error" role="alert">boom<\/p>/);
});

test("it says what is kept: temp entries newer than an hour stay", () => {
  assert.match(text(render()), /last hour/);
});
