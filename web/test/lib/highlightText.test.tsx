import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { highlightText } from "../../src/lib/highlightText.tsx";
import { renderMarkdown } from "../../src/lib/markdown.tsx";

const render = (text: string, query: string) => renderToStaticMarkup(<>{highlightText(renderMarkdown(text), query)}</>);

test("search highlights every literal occurrence regardless of case", () => {
  const html = render("A.b a.b axb", "a.b");
  assert.equal((html.match(/<mark /g) ?? []).length, 2);
  assert.match(html, />A.b<\/mark>/);
  assert.match(html, />a.b<\/mark>/);
  assert.match(html, / axb/);
});

test("search preserves formatting, link targets and code while highlighting visible text", () => {
  const html = render("**hello** [hello](https://example.com/hello) `hello`", "hello");
  assert.equal((html.match(/<mark /g) ?? []).length, 3);
  assert.match(html, /href="https:\/\/example.com\/hello"/);
  assert.match(html, /<strong><mark/);
  assert.match(html, /<code><mark/);
});

test("empty searches remove all highlights and text remains escaped", () => {
  assert.doesNotMatch(render("hello", " "), /<mark/);
  const html = renderToStaticMarkup(<>{highlightText("<script>", "<script>")}</>);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
