import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ChatMessage, HtmlRender } from "../../../../shared/api.ts";
import { timeline } from "../../../src/features/conversation/timeline.ts";

const message = (id: string, createdAt: string): ChatMessage => ({ id, role: "assistant", text: id, createdAt, streaming: false, attachments: [] });
const render = (id: string, createdAt: string): HtmlRender => ({ id, attachmentId: id, title: id, height: 100, createdAt });

test("pages sit between messages by time, equal times keep message order", () => {
  const entries = timeline({
    messages: [message("m1", "2026-01-01T10:00:00Z"), message("m2", "2026-01-01T10:00:00Z"), message("m3", "2026-01-01T12:00:00Z")],
    renders: [render("r1", "2026-01-01T11:00:00Z")],
  });
  assert.deepEqual(
    entries.map((e) => (e.kind === "message" ? e.message.id : e.render.id)),
    ["m1", "m2", "r1", "m3"],
  );
});
