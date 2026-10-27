import assert from "node:assert/strict";
import { test } from "bun:test";

const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
const rule = (selector: string) => css.split("\n").find((line) => line.startsWith(`${selector} {`)) ?? "";

test("the shimmer animates transform only, never background-position", () => {
  const frames = css.match(/@keyframes shimmer \{.*\}/)?.[0] ?? "";
  assert.match(frames, /transform: translateX\(-50%\)/);
  assert.match(frames, /transform: translateX\(150%\)/);
  assert.doesNotMatch(frames, /background-position/);
});

test("both shimmer bars are half-width compositor layers", () => {
  for (const selector of [".agent.working::after", ".desk-window.state-running .desk-window-head::after"]) {
    const line = rule(selector);
    assert.match(line, /width: 50%;/, selector);
    assert.match(line, /will-change: transform;/, selector);
    assert.match(line, /animation: shimmer 1\.8s/, selector);
    assert.doesNotMatch(line, /background-size|background-repeat/, selector);
  }
});

test("the topbar has no backdrop blur and a near-opaque background", () => {
  const line = rule(".topbar");
  assert.doesNotMatch(line, /backdrop-filter/);
  assert.match(line, /var\(--header-bg\) 97%/);
});

test("messages are never skipped by the renderer: estimated heights make the scroll jump", () => {
  assert.doesNotMatch(css, /content-visibility/);
});

test("reduced motion still stops both shimmer bars", () => {
  const block = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(block, /\.agent\.working::after/);
  assert.match(block, /\.desk-window\.state-running \.desk-window-head::after/);
});
