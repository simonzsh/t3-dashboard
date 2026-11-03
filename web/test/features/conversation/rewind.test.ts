import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ChatAttachment } from "../../../../shared/api.ts";
import { attachmentFiles, mergeDraft } from "../../../src/features/conversation/rewind.ts";

test("mergeDraft keeps what the user already typed, like T3 Code", () => {
  assert.equal(mergeDraft("", "the prompt"), "the prompt");
  assert.equal(mergeDraft("  ", "the prompt"), "the prompt");
  assert.equal(mergeDraft("draft", "the prompt"), "draft\n\nthe prompt");
  assert.equal(mergeDraft("draft", ""), "draft");
});

const attachment = (id: string, name: string, mimeType: string | null): ChatAttachment => ({ id, name, kind: "file", mimeType, sizeBytes: 3 });

test("attachmentFiles downloads each attachment as a File with its name and type", async () => {
  const urls: string[] = [];
  const get = async (url: string) => (urls.push(url), new Response("abc", { headers: { "content-type": "application/octet-stream" } }));
  const files = await attachmentFiles("t 1", [attachment("a/1", "a.txt", "text/plain"), attachment("b", "b.bin", null)], get);
  assert.deepEqual(urls, ["/api/threads/t%201/attachments/a%2F1", "/api/threads/t%201/attachments/b"]);
  assert.deepEqual(files.map((file) => [file.name, file.type.split(";")[0], file.size]), [["a.txt", "text/plain", 3], ["b.bin", "application/octet-stream", 3]]);
});

test("attachmentFiles fails when an attachment cannot be read", async () => {
  await assert.rejects(attachmentFiles("t", [attachment("a", "a.txt", null)], async () => new Response("no", { status: 404 })), /a\.txt/);
});
