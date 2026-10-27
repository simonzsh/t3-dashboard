import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ChatMessage, HtmlRender, RunChanges } from "../../../../shared/api.ts";
import { timeline } from "../../../src/features/conversation/timeline.ts";

const message = (id: string, createdAt: string, runId: string | null = null): ChatMessage => ({ id, role: "assistant", text: id, createdAt, streaming: false, attachments: [], runId });
const render = (id: string, createdAt: string): HtmlRender => ({ id, attachmentId: id, title: id, height: 100, createdAt });

test("pages sit between messages by time, equal times keep message order", () => {
  const entries = timeline({
    messages: [message("m1", "2026-01-01T10:00:00Z"), message("m2", "2026-01-01T10:00:00Z"), message("m3", "2026-01-01T12:00:00Z")],
    renders: [render("r1", "2026-01-01T11:00:00Z")],
    runChanges: [],
  });
  assert.deepEqual(
    entries.map((e) => (e.kind === "message" ? e.message.id : e.kind === "render" ? e.render.id : `changes:${e.run.runId}`)),
    ["m1", "m2", "r1", "m3"],
  );
});

const changes = (runId: string, completedAt: string): RunChanges => ({ runId, ordinal: 1, completedAt, changes: [] });
const order = (entries: ReturnType<typeof timeline>) => entries.map((e) => (e.kind === "message" ? e.message.id : e.kind === "render" ? e.render.id : `changes:${e.run.runId}`));

test("a run's changes follow the last message of that run", () => {
  const entries = timeline({
    messages: [message("m1", "2026-01-01T10:00:00Z", "a"), message("m2", "2026-01-01T10:05:00Z", "a"), message("m3", "2026-01-01T11:00:00Z", "b"), message("m4", "2026-01-01T11:05:00Z", "b")],
    renders: [],
    runChanges: [changes("a", "2026-01-01T10:06:00Z"), changes("b", "2026-01-01T11:06:00Z")],
  });
  assert.deepEqual(order(entries), ["m1", "m2", "changes:a", "m3", "m4", "changes:b"]);
});

test("a run without a message sits where it ended, and a run after every entry comes last", () => {
  const entries = timeline({
    messages: [message("m1", "2026-01-01T10:00:00Z"), message("m2", "2026-01-01T12:00:00Z")],
    renders: [],
    runChanges: [changes("x", "2026-01-01T11:00:00Z"), changes("y", "2026-01-01T13:00:00Z")],
  });
  assert.deepEqual(order(entries), ["m1", "changes:x", "m2", "changes:y"]);
});
