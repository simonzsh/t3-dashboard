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

test("dashboard bands are two stacking columns from 900 px, and one flow below", () => {
  assert.match(css, /\.dashboard-band, \.dashboard-col \{ display: contents; \}/);
  const wide = css.slice(css.indexOf("@container (min-width: 900px)"));
  assert.match(wide, /\.dashboard-band \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /grid-column: span/);
});

test("on a phone the three stat tiles stay in one row", () => {
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.doesNotMatch(phone, /\.stat-tiles \{/);
  assert.match(phone, /\.stat-value \{ font-size: 20px/);
  assert.match(phone, /\.skeleton-bars \{ height: 140px/);
});

test("the Notifications panel is sticky on a wide screen, with no block above the cards", () => {
  assert.match(rule(".dashboard-panel"), /position: sticky; top: 0;/);
  assert.match(rule(".dashboard.with-panel"), /340px/);
  assert.doesNotMatch(css, /position: static; grid-row: 1|max-height: 60dvh|position: fixed; inset: 0; z-index: 15|notifications-shown/);
});

test("the shared Sheet slides and fades both ways, under the header", () => {
  const sheet = rule(".ui-sheet");
  assert.match(sheet, /position: fixed;/);
  assert.match(sheet, /top: var\(--header-h, 0px\);/);
  assert.match(sheet, /width: min\(380px, 100vw\);/);
  assert.match(sheet, /transform: translateX\(100%\);/);
  assert.match(sheet, /transition: transform 200ms/);
  assert.match(rule(".ui-sheet.open"), /transform: none/);
  assert.match(rule(".ui-sheet.wide"), /width: min\(600px, 100vw\);/);
  assert.match(rule(".ui-sheet-backdrop"), /opacity: 0;[^}]*transition: opacity 200ms/);
  assert.match(rule(".ui-sheet-backdrop.open"), /opacity: 0\.5;/);
});

test("at 1200 px and below the Notifications panel is a side sheet under the header", () => {
  const start = css.indexOf("@media (max-width: 1200px)");
  const narrow = css.slice(start, css.indexOf("\n}\n", start));
  assert.match(narrow, /\.ui-sheet \.notifications-card \{/);
  assert.match(narrow, /html:has\(\.app\.sheet-shown\) \{ overflow: hidden; \}/);
});

test("on a phone the sheet is full width and stops above the bottom bar", () => {
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  const sheet = phone.match(/\n  \.ui-sheet \{([^}]*)\}/)?.[1] ?? "";
  assert.match(sheet, /bottom: calc\(var\(--bottom-bar\) \+ env\(safe-area-inset-bottom\)\);/);
  assert.match(sheet, /width: 100vw;/);
  assert.match(phone, /\.ui-sheet-backdrop \{ bottom: calc\(var\(--bottom-bar\)/);
const reduced = css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
  assert.match(reduced, /\.ui-sheet, \.ui-sheet-backdrop \{ transition: none; \}/);
});

test("on a phone a dialog is a bottom sheet that clears the home indicator", () => {
  const phone = css.slice(css.indexOf("/* Phone: every Dialog is a bottom sheet."));
  assert.match(phone, /\.dialog-backdrop[^{]*\{[^}]*place-items: end stretch/);
  assert.match(phone, /\.dialog-backdrop > \.dialog \{[^}]*border-radius: 16px 16px 0 0/);
  assert.match(phone, /--sheet-bottom: calc\(16px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(phone, /\.dialog-head \{[^}]*position: sticky/);
  assert.match(phone, /\.dialog-actions \{[^}]*position: sticky; bottom: 0/);
});
