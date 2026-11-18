import assert from "node:assert/strict";
import { test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PendingBubble } from "../../../src/features/conversation/PendingBubble.tsx";
import type { PendingMessage } from "../../../src/features/conversation/pending.ts";

const message: PendingMessage = { id: "p1", text: "", attachments: [], duringRun: false, sentAt: 0, baseline: 0 };

test("the outgoing bubble shows the message without a send label", () => {
  const html = renderToStaticMarkup(<PendingBubble threadId="t1" message={{ ...message, text: "**Hello**" }} />);
  assert.match(html, /<strong>Hello<\/strong>/);
  assert.doesNotMatch(html, /Sending|<small/);
});

test("an attachment-only message shows its file before the thread can serve it", () => {
  const attachments = [{ id: "a1", kind: "image", name: "photo.png", mimeType: "image/png", sizeBytes: 500 }] as const;
  const html = renderToStaticMarkup(<PendingBubble threadId="t1" message={{ ...message, attachments: [...attachments] }} />);
  assert.match(html, /photo\.png/);
  assert.doesNotMatch(html, /Sending|href=|<img/);
});
