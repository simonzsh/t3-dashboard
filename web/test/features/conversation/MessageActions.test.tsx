import { test } from "bun:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChatMessage } from "../../../../shared/api.ts";
import { MessageActions } from "../../../src/features/conversation/MessageActions.tsx";

const message = (over: Partial<ChatMessage> = {}): ChatMessage => ({ id: "m", role: "user", text: "hello", createdAt: "2026-01-01T10:00:00Z", streaming: false, attachments: [], rewindable: true, ...over });
const render = (m: ChatMessage, editDisabled = false) => renderToStaticMarkup(<MessageActions message={m} onEdit={() => {}} editDisabled={editDisabled} />);

test("every message with text has a Copy button", () => {
  assert.match(render(message()), /aria-label="Copy message"/);
  assert.match(render(message({ role: "assistant", rewindable: false })), /aria-label="Copy message"/);
  assert.doesNotMatch(render(message({ text: "" })), /Copy message/);
});

test("only a rewindable user message has Edit from here", () => {
  assert.match(render(message()), /aria-label="Edit from here"/);
  assert.doesNotMatch(render(message({ rewindable: false })), /Edit from here/);
  assert.doesNotMatch(render(message({ role: "assistant" })), /Edit from here/);
});

test("Edit from here is disabled while the thread works", () => {
  const edit = (disabled: boolean) => render(message(), disabled).match(/<button[^>]*aria-label="Edit from here"[^>]*>/)![0];
  assert.match(edit(true), /disabled=""/);
  assert.doesNotMatch(edit(false), /disabled/);
});
