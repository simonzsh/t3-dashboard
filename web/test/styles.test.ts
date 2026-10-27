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

test("settled messages are skipped by the renderer until near the viewport", () => {
  const line = rule(".messages > .msg:not(.render):not(.pending)");
  assert.match(line, /content-visibility: auto;/);
  assert.match(line, /contain-intrinsic-size: auto 120px;/);
});

test("reduced motion still stops both shimmer bars", () => {
  const block = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(block, /\.agent\.working::after/);
  assert.match(block, /\.desk-window\.state-running \.desk-window-head::after/);
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
