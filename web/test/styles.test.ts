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

test("on a phone the dialog sheet runs under the keyboard and pads its content above it", () => {
  const phone = css.slice(css.indexOf("/* Phone: every Dialog is a bottom sheet."));
  assert.match(phone, /--sheet-max: calc\(var\(--visible-h, 100dvh\)/);
  assert.match(phone, /max-height: calc\(var\(--sheet-max\) \+ var\(--kb\)\)/);
  assert.match(phone, /padding: 0 var\(--sheet-x\) calc\(var\(--sheet-bottom\) \+ var\(--kb\)\)/);
  assert.doesNotMatch(phone, /\.dialog-backdrop[^{]*\{[^}]*height: var\(--visible-h/);
});

test("on a phone an open keyboard drops the bottom bar and the bottom inset", () => {
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.match(phone, /\.keyboard-open \.bottom-nav \{ display: none; \}/);
  assert.match(phone, /\.keyboard-open \.app \.app-column \{ padding-bottom: 0; \}/);
});

test("an open dialog or sheet locks the page scroll", () => {
  assert.match(css, /html:has\(\.dialog-backdrop:not\(\[hidden\]\)\), html:has\(\.ui-sheet\.open\) \{ overflow: hidden; \}/);
});

test("news: the article is a readable column, and on a phone the list and the article take turns", () => {
  // A rem width, not ch: ch follows each child's font size, so the date line and the text would not share a left edge.
  assert.match(css, /\.news-article > \* \{ max-width: 42rem;/);
  assert.match(rule(".news-body"), /line-height: 1\.7/);
  assert.match(rule(".news-back"), /display: none/);
  const phone = css.slice(css.indexOf("@media (max-width: 700px)"));
  assert.match(phone, /\.news-page:not\(\.reading\) \.news-article, \.news-page\.reading \.news-list \{ display: none; \}/);
  // The list's wide-screen width must not reach a phone.
  assert.match(phone, /\.news-page:not\(\.empty\) > \.news-list \{ width: auto; \}/);
  assert.match(phone, /\.news-back \{ display: inline-flex;/);
});

test("news: the phone rules come after the base rules, so the article fills the width", () => {
  const base = css.indexOf(".news-page { container-type: inline-size;");
  const phone = css.indexOf("@media (max-width: 700px) {\n  /* Like Automations, the page holds still: only the article list, or the open article, scrolls under the bar. */");
  assert.ok(base > 0 && phone > base, "the news phone block must follow the base rules");
  const block = css.slice(phone, css.indexOf("\n}\n", phone));
  // No list beside the article on a phone: nothing may push the text right.
  assert.match(block, /\.news-page \{ display: flex; flex-direction: column; \}/);
  assert.match(block, /\.news-page > \* \{ --news-list-space: 0px; \}/);
  assert.match(block, /\.news-back \{ display: inline-flex;/);
  assert.match(block, /\.news-article \{ flex: 1; \}/);
  // No later base rule may undo the phone block.
  assert.doesNotMatch(css.slice(css.indexOf("\n}\n", phone)), /^\.news-(page|back|list|article) \{/m);
});

test("news: the article keeps reading width with a modest offset from the list", () => {
  // List and article share one grid cell; the text only steps right when the page is too narrow for both.
  assert.match(css, /\.news-page > \* \{[^}]*grid-area: 1 \/ 1; \}/);
  assert.match(css, /\.news-article > \* \{ max-width: 42rem; margin-inline: max\(var\(--news-list-space\), calc\(\(100% - 42rem\) \/ 2 \+ var\(--news-list-space\) \/ 4\)\) auto; \}/);
});

test("every page gets the same edges from the page tokens, with no page-specific main", () => {
  for (const token of ["--page-top: 24px", "--page-x: 24px", "--page-bottom: 24px", "--page-ring: 4px", "--page-gap: 16px"]) assert.ok(css.includes(token), token);
  assert.match(rule("main"), /padding: var\(--page-top\) var\(--page-x\) 0;/);
  assert.match(rule(".page-scroll"), /overflow-y: auto; padding: var\(--page-ring\) var\(--page-ring\) var\(--page-bottom\); margin: calc\(-1 \* var\(--page-ring\)\) calc\(-1 \* var\(--page-ring\)\) 0;/);
  assert.doesNotMatch(css, /main:has\(/);
});

test("list pages: the head sits outside the scroll box, so it never moves, and no page makes its own toolbar sticky", () => {
  assert.match(rule(".list-page"), /flex: 1; min-height: 0; display: flex; flex-direction: column;/);
  assert.match(rule(".list-page-head"), /flex: none;/);
  assert.match(rule(".list-page"), /gap: var\(--page-gap\);/);
  // A sticky toolbar inside the scroll box slides by the box's padding as soon as the list scrolls.
  for (const selector of [".list-page-head", ".list-toolbar", ".news-list-head"]) assert.doesNotMatch(rule(selector), /sticky|overflow/, selector);
  // Pages only add spacing: the scroll and the size come from the shared rules.
  for (const selector of [".auto-scroll", ".news-list-head"]) assert.doesNotMatch(rule(selector), /overflow-y|min-height/, selector);
  assert.doesNotMatch(css, /\.auto-page \{[^}]*overflow-y/);
});

test("one spin keyframe, and shared rows have one rule each", () => {
  assert.equal(css.match(/@keyframes spin /g)?.length, 1);
  for (const selector of [".row-icons", ".linear-status"]) assert.equal(css.split("\n").filter((line) => line.startsWith(`${selector} {`)).length, 1);
});

test("pull requests: the file headers and the file list stick inside the page, and a dark theme recolours the tokens", () => {
  assert.match(rule(".pulls-detail-side"), /position: sticky; top: 0;/);
  assert.match(rule(".pr-diff-file-head"), /position: sticky; top: 0;/);
  // Sticky parts stick at top 0 under a flush head; a negative top would hide them under it.
  assert.doesNotMatch(css, /position: sticky; top: calc\(-/);
  assert.match(rule(".pr-diff-file-head"), /border-radius: 0;/);
  assert.match(css, /:root\[data-theme="dark"\] :is\(\.hljs-keyword/);
});

test("the current row of a tree is marked by a tint, never by a side bar", () => {
  assert.match(rule(".ui-tree-row.active"), /background: color-mix\(in srgb, var\(--text-primary\) 10%, transparent\);/);
  assert.doesNotMatch(css, /ui-tree-row[^{]*\{[^}]*box-shadow: inset/);
});

test("a flush list page moves the head-to-body space into the body, so sticky children touch the head", () => {
  const shell = css.slice(css.indexOf("/* page-shell:start"), css.indexOf("/* page-shell:end */"));
  assert.match(shell, /\.list-page\.flush \{ gap: 0; \}/);
  assert.match(shell, /\.list-page\.flush > \.list-page-body \{ margin-top: 0; padding-top: 0; \}/);
  assert.match(shell, /\.list-page\.flush > \.list-page-body::before \{ content: ""; display: block; height: var\(--page-gap\); \}/);
});

test("every page scroll box forces its clip, so no content paints past its edge on iOS", () => {
  assert.match(rule(".page-scroll"), /clip-path: inset\(0\);/);
});

test("hovering an open file header keeps its separator gray", () => {
  assert.match(rule(".pr-diff-file-head.open"), /box-shadow: inset 0 -1px var\(--line\);/);
  assert.doesNotMatch(rule(".pr-diff-file-head.open"), /border/);
});

test("the pull request head keeps room above the stuck file header and tree", () => {
  assert.match(rule(".pulls-head"), /padding-bottom: 10px;/);
});

test("a pull request row lights up as a whole on hover, Sessions button included", () => {
  assert.match(css, /\.pulls-row:hover \{ background:/);
  assert.doesNotMatch(css, /\.pulls-row-main:hover/);
});

test("on a phone only the diff runs edge to edge; the description and the file tab keep the page edge", () => {
  assert.match(css, /\.pulls-detail-main > :not\(\.pulls-changes\), \.pulls-changes > :not\(\.pr-diff\), \.pr-diff > :not\(\.pr-diff-files\) \{ margin-inline: var\(--page-x\); \}/);
});

test("a hovered underline tab keeps the bar line under it", () => {
  assert.match(css, /\.tabs\.underline button:not\(\.active\):hover \{ box-shadow: inset 0 -1px var\(--line\); \}/);
});

test("an ActionMenu has a max width and only the row detail gives way", () => {
  assert.match(rule(".action-menu"), /max-width: min\(420px, calc\(100vw - 16px\)\)/);
  assert.match(rule(".action-menu-label"), /flex: none; white-space: nowrap/);
  assert.match(rule(".action-menu-detail"), /min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap/);
});
