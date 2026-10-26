import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { plainText, renderMarkdown, safeHref } from "../../src/lib/markdown.tsx";

const html = (text: string) => renderToStaticMarkup(renderMarkdown(text));

test("headings, emphasis and inline code", () => {
  assert.equal(html("## Title\n\nSome **bold**, *italic*, ~~old~~ and `a < b`."), "<h2>Title</h2><p>Some <strong>bold</strong>, <em>italic</em>, <del>old</del> and <code>a &lt; b</code>.</p>");
});

test("lists, task items and ordered start", () => {
  assert.equal(html("- one\n- two"), "<ul><li>one</li><li>two</li></ul>");
  assert.equal(html("3. three\n4. four"), '<ol start="3"><li>three</li><li>four</li></ol>');
  assert.equal(html("- [x] done"), '<ul><li><input type="checkbox" disabled="" checked=""/>done</li></ul>');
});

test("fenced code keeps its text verbatim in a pre block", () => {
  assert.equal(html("```ts\nconst a = <T>(x: T) => x;\n```"), '<pre><code class="language-ts">const a = &lt;T&gt;(x: T) =&gt; x;</code></pre>');
});

test("tables, blockquotes and rules", () => {
  assert.equal(
    html("| A | B |\n|:--|--:|\n| 1 | **2** |"),
    '<div class="md-table"><table><thead><tr><th style="text-align:left">A</th><th style="text-align:right">B</th></tr></thead><tbody><tr><td style="text-align:left">1</td><td style="text-align:right"><strong>2</strong></td></tr></tbody></table></div>',
  );
  assert.equal(html("> quoted\n\n---"), "<blockquote><p>quoted</p></blockquote><hr/>");
});

test("links open in a new tab without a referrer", () => {
  assert.equal(html("[docs](https://example.com/a?b=1)"), '<p><a href="https://example.com/a?b=1" target="_blank" rel="noreferrer">docs</a></p>');
  assert.equal(html("see https://example.com"), '<p>see <a href="https://example.com" target="_blank" rel="noreferrer">https://example.com</a></p>');
});

test("raw HTML and unsafe links stay plain text", () => {
  assert.equal(html('<img src=x onerror="alert(1)">'), "<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>");
  assert.equal(html("a <b>bold</b> b"), "<p>a &lt;b&gt;bold&lt;/b&gt; b</p>");
  assert.equal(html("[click](javascript:alert(1))"), "<p>click</p>");
  assert.equal(html("![pic](https://example.com/p.png)"), '<p><a href="https://example.com/p.png" target="_blank" rel="noreferrer">pic</a></p>');
});

test("safeHref allows http, https and mailto only", () => {
  assert.equal(safeHref("https://a.example"), "https://a.example");
  assert.equal(safeHref("mailto:me@a.example"), "mailto:me@a.example");
  for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "data:text/html,x", "/relative", "vbscript:x"]) assert.equal(safeHref(bad), null, bad);
});

test("a tight list keeps nested lists inside the item", () => {
  assert.equal(html("- a\n  - b\n  - c\n- d"), "<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul>");
});

test("a fenced code block inside a list item renders as code", () => {
  const out = html("- run:\n  ```sh\n  ls <dir>\n  ```\n- next");
  assert.ok(out.includes('<pre><code class="language-sh">ls &lt;dir&gt;'), out);
  assert.ok(!out.includes("```"), out);
});

test("a local image shows through the caller's URL; others stay links", () => {
  const withMedia = (text: string) => renderToStaticMarkup(renderMarkdown(text, { localMedia: (path) => `/media?path=${encodeURIComponent(path)}` }));
  assert.equal(withMedia("![shot](/tmp/a.png)"), '<p><img class="md-image" src="/media?path=%2Ftmp%2Fa.png" alt="shot" loading="lazy"/></p>');
  assert.equal(withMedia("![logo](https://example.com/a.png)"), '<p><a href="https://example.com/a.png" target="_blank" rel="noreferrer">logo</a></p>');
  assert.equal(html("![shot](/tmp/a.png)"), "<p>shot</p>");
});

test("a local video becomes a player", () => {
  const out = renderToStaticMarkup(renderMarkdown("![demo](/tmp/a.mp4)", { localMedia: (path) => `/media?path=${encodeURIComponent(path)}` }));
  assert.match(out, /^<p><video class="md-image" src="\/media\?path=%2Ftmp%2Fa.mp4" aria-label="demo" controls="" muted="" playsInline="" preload="metadata"><\/video><\/p>$/);
});

test("plainText keeps the words and drops the marks", () => {
  assert.equal(plainText("Ready to run on **staging**: `0042_split`.\n\n- one\n- two"), "Ready to run on staging: 0042_split. one two");
  assert.equal(plainText("| A | B |\n| - | - |\n| 1 | 2 |"), "A B 1 2");
});
