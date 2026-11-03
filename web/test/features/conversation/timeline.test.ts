import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ChatMessage, HtmlRender, StepKind, TurnStep } from "../../../../shared/api.ts";
import { timeline, type Entry } from "../../../src/features/conversation/timeline.ts";

const message = (id: string, createdAt: string): ChatMessage => ({ id, role: "assistant", text: id, createdAt, streaming: false, attachments: [], rewindable: false });
const render = (id: string, createdAt: string): HtmlRender => ({ id, attachmentId: id, title: id, height: 100, createdAt });
const step = (id: string, kind: StepKind, startedAt: string): TurnStep => ({ id, runId: "run", kind, status: "done", startedAt, completedAt: null, text: id, detail: null, expandable: false, exitCode: null });

const label = (e: Entry): string => {
  if (e.kind === "message") return e.message.id;
  if (e.kind === "render") return e.render.id;
  if (e.kind === "step") return e.step.id;
  return `work(${e.steps.map((s) => s.id).join(",")})`;
};
const labels = (detail: Parameters<typeof timeline>[0]) => timeline(detail).map(label);

test("pages sit between messages by time, equal times keep message order", () => {
  const entries = timeline({
    messages: [message("m1", "2026-01-01T10:00:00Z"), message("m2", "2026-01-01T10:00:00Z"), message("m3", "2026-01-01T12:00:00Z")],
    renders: [render("r1", "2026-01-01T11:00:00Z")],
    steps: [],
  });
  assert.deepEqual(entries.map(label), ["m1", "m2", "r1", "m3"]);
});

test("consecutive work steps form one group between messages", () => {
  assert.deepEqual(
    labels({
      messages: [message("m1", "2026-01-01T10:00:00Z"), message("m2", "2026-01-01T10:10:00Z")],
      renders: [],
      steps: [step("a", "thinking", "2026-01-01T10:01:00Z"), step("b", "command", "2026-01-01T10:02:00Z"), step("c", "file", "2026-01-01T10:03:00Z")],
    }),
    ["m1", "work(a,b,c)", "m2"],
  );
});

test("todo, plan, notice and subagent steps stand alone and split a group", () => {
  assert.deepEqual(
    labels({
      messages: [],
      renders: [],
      steps: [
        step("a", "command", "2026-01-01T10:01:00Z"),
        step("todo", "todo", "2026-01-01T10:02:00Z"),
        step("b", "tool", "2026-01-01T10:03:00Z"),
        step("c", "search", "2026-01-01T10:04:00Z"),
        step("sub", "subagent", "2026-01-01T10:05:00Z"),
        step("plan", "plan", "2026-01-01T10:06:00Z"),
        step("note", "notice", "2026-01-01T10:07:00Z"),
        step("d", "web", "2026-01-01T10:08:00Z"),
      ],
    }),
    ["work(a)", "todo", "work(b,c)", "sub", "plan", "note", "work(d)"],
  );
});

test("a message in the middle of the steps splits the group", () => {
  assert.deepEqual(
    labels({
      messages: [message("m", "2026-01-01T10:02:30Z")],
      renders: [],
      steps: [step("a", "command", "2026-01-01T10:01:00Z"), step("b", "command", "2026-01-01T10:02:00Z"), step("c", "command", "2026-01-01T10:03:00Z")],
    }),
    ["work(a,b)", "m", "work(c)"],
  );
});

test("a step without a time stays after the step before it", () => {
  assert.deepEqual(
    labels({
      messages: [message("m", "2026-01-01T10:00:00Z")],
      renders: [],
      steps: [step("a", "command", "2026-01-01T10:05:00Z"), step("b", "command", "")],
    }),
    ["m", "work(a,b)"],
  );
});
