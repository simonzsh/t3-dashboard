import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ChatAttachment } from "../../../../shared/api.ts";
import { attachmentTarget, mediaTarget, previewKind } from "../../../src/features/conversation/attachmentPreview.ts";

const file = (name: string, mimeType: string | null, kind: ChatAttachment["kind"] = "file"): ChatAttachment => ({ id: "a/1", name, kind, mimeType, sizeBytes: 3 });

test("previewKind picks the frame by type, then by extension", () => {
  assert.equal(previewKind(file("shot.png", "image/png", "image")), "image");
  assert.equal(previewKind(file("a.pdf", "application/pdf")), "pdf");
  assert.equal(previewKind(file("page.html", "text/html")), "html");
  assert.equal(previewKind(file("page.HTM", null)), "html");
  assert.equal(previewKind(file("notes.md", "text/markdown")), "text");
  assert.equal(previewKind(file("data.json", "application/json")), "text");
  assert.equal(previewKind(file("a.zip", "application/zip")), "other");
  assert.equal(previewKind(file("blob", null)), "other");
  assert.equal(previewKind(file("a.pdf", "application/octet-stream")), "other");
});

test("an image or a PDF opens from its own URL, and always downloads from the raw one", () => {
  assert.deepEqual(attachmentTarget("t 1", file("shot.png", "image/png", "image"), "dark"), {
    name: "shot.png",
    kind: "image",
    src: "/api/threads/t%201/attachments/a%2F1",
    open: "/api/threads/t%201/attachments/a%2F1",
    download: "/api/threads/t%201/attachments/a%2F1?raw=1",
  });
  const pdf = attachmentTarget("t", file("a.pdf", "application/pdf"), "dark")!;
  assert.equal(pdf.src, "/api/threads/t/attachments/a%2F1?inline=1");
  assert.equal(pdf.open, pdf.src);
  assert.equal(pdf.download, "/api/threads/t/attachments/a%2F1?raw=1");
});

test("an HTML file is framed as the themed page, never as raw bytes", () => {
  const page = attachmentTarget("t", file("page.html", "text/html"), "dark")!;
  assert.equal(page.src, "/api/threads/t/attachments/a%2F1?theme=dark");
  assert.equal(page.download, "/api/threads/t/attachments/a%2F1?raw=1");
});

test("a file with no preview has no target: its chip keeps the download", () => {
  assert.equal(attachmentTarget("t", file("a.zip", "application/zip"), "dark"), null);
});

test("an image an agent cites opens and downloads from the media URL", () => {
  assert.deepEqual(mediaTarget("t", "/tmp/out/shot 1.png"), {
    name: "shot 1.png",
    kind: "image",
    src: "/api/threads/t/media?path=%2Ftmp%2Fout%2Fshot%201.png",
    open: "/api/threads/t/media?path=%2Ftmp%2Fout%2Fshot%201.png",
    download: "/api/threads/t/media?path=%2Ftmp%2Fout%2Fshot%201.png",
  });
});
