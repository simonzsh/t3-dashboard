import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ChatMessage, HtmlRender, StepKind, TurnStep } from "../../../../shared/api.ts";
import { awaitingStep, timeline, type Entry } from "../../../src/features/conversation/timeline.ts";

const message = (id: string, createdAt: string): ChatMessage => ({ id, role: "assistant", text: id, createdAt, streaming: false, attachments: [], rewindable: false });
const render = (id: string, createdAt: string): HtmlRender => ({ id, attachmentId: id, title: id, height: 100, createdAt });
const step = (id: string, kind: StepKind, startedAt: string): TurnStep => ({ id, runId: "run", kind, status: "done", startedAt, completedAt: null, text: id, detail: null, expandable: false, exitCode: null });

const label = (e: Entry): string => {
  if (e.kind === "message") return e.message.id;
  if (e.kind === "render") return e.render.id;
  if (e.kind === "step") return e.step.id;
  if (e.kind === "subagents") return `subs(${e.steps.map((s) => s.id).join(",")})`;
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
    ["work(a)", "todo", "work(b,c)", "subs(sub)", "plan", "note", "work(d)"],
  );
});

const sub = (id: string, startedAt: string, turnId: string | null, runId = "run"): TurnStep => ({
  ...step(id, "subagent", startedAt),
  runId,
  subagent: { subagentId: id, childThreadId: null, progress: null, stoppable: false, state: "running", provider: null, turnId },
});

test("consecutive subagents of one run and turn share a group", () => {
  assert.deepEqual(
    labels({
      messages: [],
      renders: [],
      steps: [
        sub("a", "2026-01-01T10:01:00Z", "t1"),
        sub("b", "2026-01-01T10:01:01Z", "t1"),
        sub("c", "2026-01-01T10:01:02Z", "t2"),
        sub("d", "2026-01-01T10:01:03Z", "t2", "other"),
        step("w", "command", "2026-01-01T10:01:04Z"),
        sub("e", "2026-01-01T10:01:05Z", "t2", "other"),
      ],
    }),
    ["subs(a,b)", "subs(c)", "subs(d)", "work(w)", "subs(e)"],
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

const user = (id: string, createdAt: string): ChatMessage => ({ ...message(id, createdAt), role: "user" });
const entriesOf = (messages: ChatMessage[], steps: TurnStep[] = []) => timeline({ messages, renders: [], steps });

test("awaitingStep: a running thread whose last entry is the user's message has no step yet", () => {
  assert.equal(awaitingStep(entriesOf([user("u", "2026-01-01T10:00:00Z")]), true), true);
  assert.equal(awaitingStep(entriesOf([user("u", "2026-01-01T10:00:00Z")]), false), false);
});

test("awaitingStep: a step, a reply or an empty thread ends the wait", () => {
  const u = user("u", "2026-01-01T10:00:00Z");
  assert.equal(awaitingStep(entriesOf([u], [step("a", "command", "2026-01-01T10:00:05Z")]), true), false);
  assert.equal(awaitingStep(entriesOf([u, message("m", "2026-01-01T10:00:09Z")]), true), false);
  assert.equal(awaitingStep([], true), false);
});
