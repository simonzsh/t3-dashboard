import assert from "node:assert/strict";
import { test } from "bun:test";

const css = await Bun.file(new URL("../src/styles.css", import.meta.url)).text();
const rule = (selector: string) => css.split("\n").find((line) => line.startsWith(`${selector} {`)) ?? "";

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

test("reduced motion still stops the pulse", () => {
  const block = css.slice(css.indexOf("prefers-reduced-motion"));
  assert.match(block, /\.pulse/);
  assert.doesNotMatch(css, /\.session-window[^{]*state-running[^{]*::after/);
});

test("fields and the composer card share one focus ring and radius", () => {
  assert.match(rule(":where(.field):focus-visible"), /box-shadow: var\(--field-ring\)/);
  assert.match(rule(".composer-card:focus-within"), /var\(--field-ring\)/);
  assert.match(rule("textarea.field"), /border-radius: var\(--radius-lg\)/);
  assert.match(rule(".composer-card"), /border-radius: var\(--radius-lg\)/);
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

test("on a phone every dashboard card slot is full width and may shrink", () => {
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.match(phone, /\.dashboard \{[^}]*align-items: stretch/);
  assert.match(phone, /\.dashboard-slot \{[^}]*width: 100%; min-width: 0/);
});

test("on a phone the three stat tiles stay in one row", () => {
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.doesNotMatch(phone, /\.stat-tiles \{/);
  assert.match(phone, /\.stat-value \{ font-size: 20px/);
  assert.match(phone, /\.skeleton-bars \{ height: 140px/);
});

test("the Notifications panel is sticky on a wide screen and a full-screen layer on a phone", () => {
  assert.match(rule(".dashboard-panel"), /position: sticky; top: 0;/);
  assert.match(rule(".dashboard.with-panel"), /340px/);
  assert.match(css, /^ {2}\.dashboard-panel \{[^}]*position: fixed; inset: 0;/m);
});
