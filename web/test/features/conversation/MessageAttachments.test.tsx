import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatAttachment } from "../../../../shared/api.ts";
import { PreviewDialog } from "../../../src/features/conversation/AttachmentPreview.tsx";
import { MessageAttachments } from "../../../src/features/conversation/MessageAttachments.tsx";

const image: ChatAttachment = { id: "i1", name: "shot.png", kind: "image", mimeType: "image/png", sizeBytes: 10 };
const pdf: ChatAttachment = { id: "p1", name: "a.pdf", kind: "file", mimeType: "application/pdf", sizeBytes: 2048 };
const zip: ChatAttachment = { id: "z1", name: "a.zip", kind: "file", mimeType: "application/zip", sizeBytes: null };

test("an image is a button around its thumbnail, not a link to another page", () => {
  const html = renderToStaticMarkup(<MessageAttachments threadId="t" attachments={[image]} />);
  assert.match(html, /<button[^>]*class="msg-thumb"[^>]*><img src="\/api\/threads\/t\/attachments\/i1" alt="shot\.png"/);
  assert.doesNotMatch(html, /target="_blank"/);
});

test("a previewable file is a button; a file with no preview downloads", () => {
  const html = renderToStaticMarkup(<MessageAttachments threadId="t" attachments={[pdf, zip]} />);
  assert.match(html, /<button[^>]*class="msg-file"[^>]*>.*a\.pdf/);
  assert.match(html, /<a class="msg-file" href="\/api\/threads\/t\/attachments\/z1\?raw=1" download="a\.zip">/);
});

test("no attachment renders nothing", () => {
  assert.equal(renderToStaticMarkup(<MessageAttachments threadId="t" attachments={[]} />), "");
});

test("the dialog frames a PDF and offers Download and Open in new tab", () => {
  const target = { name: "a.pdf", kind: "pdf" as const, src: "/v?inline=1", open: "/v?inline=1", download: "/v?raw=1" };
  const html = renderToStaticMarkup(<PreviewDialog target={target} onClose={() => {}} />);
  assert.match(html, /<iframe[^>]*src="\/v\?inline=1"/);
  assert.doesNotMatch(html, /sandbox=/);
  assert.match(html, /<a[^>]*href="\/v\?raw=1"[^>]*download="a\.pdf"[^>]*>Download<\/a>/);
  assert.match(html, /<a[^>]*href="\/v\?inline=1"[^>]*target="_blank"[^>]*>Open in new tab<\/a>/);
});

test("the dialog shows an image large and sandboxes an HTML page", () => {
  const base = { name: "n", src: "/s", open: "/s", download: "/d" };
  assert.match(renderToStaticMarkup(<PreviewDialog target={{ ...base, kind: "image" }} onClose={() => {}} />), /<img src="\/s" alt="n"/);
  assert.match(renderToStaticMarkup(<PreviewDialog target={{ ...base, kind: "html" }} onClose={() => {}} />), /<iframe[^>]*sandbox="allow-scripts allow-popups"/);
});
