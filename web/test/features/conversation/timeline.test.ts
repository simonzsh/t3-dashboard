import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ChatMessage, HtmlRender, StepKind, TurnStep } from "../../../../shared/api.ts";
import { awaitingStep, historyStart, timelineKey, timeline, type Entry } from "../../../src/features/conversation/timeline.ts";

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

test("awaitingStep: only a trailing work group supplies its own running indicator", () => {
  const u = user("u", "2026-01-01T10:00:00Z");
  assert.equal(awaitingStep(entriesOf([u], [step("a", "command", "2026-01-01T10:00:05Z")]), true), false);
  assert.equal(awaitingStep(entriesOf([u, message("m", "2026-01-01T10:00:09Z")]), true), true);
  assert.equal(awaitingStep([], true), true);
});


test("awaitingStep: notices after completed work keep the active run visible", () => {
  const entries = entriesOf([], [step("a", "command", "2026-01-01T10:00:05Z"), step("n", "notice", "2026-01-01T10:00:09Z")]);
  assert.equal(awaitingStep(entries, true), true);
  assert.equal(awaitingStep(entries, false), false);
});

test("checkpoints stay available in the data without appearing or splitting work", () => {
  const checkpoint: TurnStep = { ...step("cp", "notice", "2026-01-01T10:02:00Z"), notice: "checkpoint" };
  const error: TurnStep = { ...step("error", "notice", "2026-01-01T10:04:00Z"), notice: "error" };
  const detail = {
    messages: [message("reply", "2026-01-01T10:05:00Z")], renders: [],
    steps: [step("a", "command", "2026-01-01T10:01:00Z"), checkpoint,
      step("b", "command", "2026-01-01T10:03:00Z"), error,
      { ...checkpoint, id: "final-cp", startedAt: "2026-01-01T10:06:00Z" }],
  };
  assert.deepEqual(labels(detail), ["work(a,b)", "error", "reply"]);
  assert.equal(detail.steps.length, 5);
  assert.equal(detail.steps[1], checkpoint);
});


test("history starts with a bounded recent batch and follows new messages", () => {
  const entries: Entry[] = Array.from({ length: 100 }, (_, i) => ({ kind: "message", at: "", message: message(`m${i}`, "") }));
  assert.equal(historyStart(entries, null, true, null, 40), 60);
  assert.equal(historyStart(entries, "message:m10", true, null, 40), 60);
  assert.equal(historyStart(entries.slice(0, 20), null, true, null, 40), 0);
  assert.equal(historyStart([], null, true, null, 40), 0);
});

test("reading preserves the first row across insertions and resets after rewind removes it", () => {
  const entries: Entry[] = Array.from({ length: 100 }, (_, i) => ({ kind: "message", at: "", message: message(`m${i}`, "") }));
  assert.equal(historyStart(entries, "message:m20", false, null, 40), 20);
  const inserted: Entry = { kind: "message", at: "", message: message("older", "") };
  assert.equal(historyStart([inserted, ...entries], "message:m20", false, null, 40), 21);
  assert.equal(historyStart(entries.slice(0, 10), "message:m20", false, null, 40), 0);
});

test("search reveals an unloaded result without hiding newer rows or confusing entry kinds", () => {
  const entries: Entry[] = Array.from({ length: 100 }, (_, i) => ({ kind: "message", at: "", message: message(`m${i}`, "") }));
  assert.equal(historyStart(entries, null, true, "m5", 40), 5);
  assert.equal(historyStart(entries, "message:m20", false, "m80", 40), 20);
  assert.equal(historyStart(entries, null, true, "missing", 40), 60);
  assert.notEqual(timelineKey(entries[0]!), timelineKey({ kind: "render", at: "", render: render("m0", "") }));
});
