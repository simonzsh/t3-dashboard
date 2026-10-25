import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { renderMarkdown, safeHref } from "../src/markdown.tsx";

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
