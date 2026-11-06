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

test("the shimmer bar is a half-width compositor layer", () => {
  for (const selector of [".run-row.working::after"]) {
    const line = rule(selector);
    assert.match(line, /width: 50%;/, selector);
    assert.match(line, /will-change: transform;/, selector);
    assert.match(line, /animation: shimmer 1\.8s/, selector);
    assert.doesNotMatch(line, /background-size|background-repeat/, selector);
  }
});

test("the page header has no backdrop blur and a near-opaque background", () => {
  const line = rule(".page-header");
  assert.doesNotMatch(line, /backdrop-filter/);
  assert.match(line, /var\(--header-bg\) 97%/);
});

test("the bottom bar clears the iPhone home indicator", () => {
  assert.match(rule(".bottom-nav"), /env\(safe-area-inset-bottom\)/);
});

test("messages are never skipped by the renderer: estimated heights make the scroll jump", () => {
  assert.doesNotMatch(css, /content-visibility/);
});

test("reduced motion still stops the shimmer bar and the pulse", () => {
  const block = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(block, /\.run-row\.working::after/);
  assert.match(block, /\.pulse/);
  assert.doesNotMatch(css, /\.session-window[^{]*state-running[^{]*::after/);
});

test("fields and the composer card share one focus ring and radius", () => {
  assert.match(rule(":where(.field):focus-visible"), /box-shadow: var\(--field-ring\)/);
  assert.match(rule(".composer-card:focus-within"), /var\(--field-ring\)/);
  assert.match(rule("textarea.field"), /border-radius: var\(--radius-composer\)/);
  assert.match(rule(".composer-card"), /border-radius: var\(--radius-composer\)/);
  assert.match(rule(".field::placeholder"), /var\(--text-secondary\)/);
});

test("textareas cannot be resized by hand and stop growing at a max height", () => {
  for (const selector of ["textarea.field", ".composer-card textarea"]) {
    assert.match(rule(selector), /resize: none;/);
    assert.match(rule(selector), /max-height: min\(40vh, 260px\);/);
  }
});

test("a queued message has a dashed bubble", () => {
  assert.match(rule(".msg.user.queued .bubble"), /border-style: dashed;/);
});
