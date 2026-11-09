import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { Icon } from "../../src/ui/Icon.tsx";

test("archive actions provide distinct icons and preserve accessible names", () => {
  const settle = renderToStaticMarkup(<Icon name="archive" label="Settle" />);
  const restore = renderToStaticMarkup(<Icon name="archiveRestore" label="Unsettle" />);
  assert.match(restore, /role="img" aria-label="Unsettle"/);
  assert.notEqual(settle.replace("Settle", ""), restore.replace("Unsettle", ""));
  assert.match(renderToStaticMarkup(<Icon name="archiveRestore" />), /aria-hidden="true"/);
});

test("the T3 logo keeps its native proportions and filled path", () => {
  const html = renderToStaticMarkup(<Icon name="t3" label="T3 Code" />);
  assert.match(html, /viewBox="7 29 111 74"/);
  assert.match(html, /fill="currentColor"/);
  assert.match(html, /aria-label="T3 Code"/);
  assert.doesNotMatch(html, /stroke=/);
});

test("the citation icon has two quotation marks and stays decorative by default", () => {
  const html = renderToStaticMarkup(<Icon name="quote" />);
  assert.equal((html.match(/<path /g) ?? []).length, 2);
  assert.match(html, /aria-hidden="true"/);
});
