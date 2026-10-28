import assert from "node:assert/strict";
import { test } from "bun:test";
import { toThreadDetail } from "../../src/domain/threadDetail.ts";
import type { RawProjection } from "../../src/integrations/t3/schemas.ts";

const projection: RawProjection = {
  messages: [
    { id: "m1", role: "user", text: "Hello", createdAt: "2026-03-01T10:00:00Z" },
    { id: "hidden", role: "assistant", text: "internal", createdAt: "2026-03-01T10:00:01Z" },
    { id: "m2", role: "assistant", text: "Hi there", createdAt: "2026-03-01T10:00:02Z", streaming: true },
  ],
  visibleTurnItems: [{ item: { type: "message", messageId: "m1" } }, { item: { type: "message", messageId: "m2" } }],
};

test("keeps visible messages in their original order and defaults streaming to false", () => {
  const detail = toThreadDetail("thread-1", projection, undefined);
  assert.deepEqual(detail.messages, [
    { id: "m1", role: "user", text: "Hello", createdAt: "2026-03-01T10:00:00Z", streaming: false, attachments: [] },
    { id: "m2", role: "assistant", text: "Hi there", createdAt: "2026-03-01T10:00:02Z", streaming: true, attachments: [] },
  ]);
  assert.equal(detail.threadId, "thread-1");
  assert.equal(detail.thread, null);
});

test("passes the store thread through", () => {
  const thread = { id: "thread-1" } as never;
  assert.equal(toThreadDetail("thread-1", projection, thread).thread, thread);
});

test("an empty projection gives empty lists", () => {
  const detail = toThreadDetail("thread-1", {}, undefined);
  assert.deepEqual([detail.messages, detail.pendingRequests, detail.subagents], [[], [], []]);
});

test("thread settings come from the projection thread; unknown runtime modes give null", () => {
  const selection = { instanceId: "provider-a", model: "model-x", options: [{ id: "effort", value: "high" }] };
  const detail = toThreadDetail("thread-1", { thread: { id: "thread-1", modelSelection: selection, runtimeMode: "approval-required" } }, undefined);
  assert.deepEqual([detail.modelSelection, detail.runtimeMode], [selection, "approval-required"]);
  const odd = toThreadDetail("thread-1", { thread: { id: "thread-1", runtimeMode: "yolo" } }, undefined);
  assert.deepEqual([odd.modelSelection, odd.runtimeMode], [null, null]);
  const none = toThreadDetail("thread-1", {}, undefined);
  assert.deepEqual([none.modelSelection, none.runtimeMode], [null, null]);
});

const withRequests: RawProjection = {
  runtimeRequests: [
    { id: "req-approval", kind: "command", status: "pending", createdAt: "2026-03-01T11:00:00Z", responseCapability: { type: "live" } },
    { id: "req-input", kind: "user_input", status: "pending", createdAt: "2026-03-01T11:01:00Z", responseCapability: { type: "not_resumable" } },
    { id: "req-other", kind: "dynamic_tool_call", status: "pending" },
    { id: "req-orphan", kind: "command", status: "pending", createdAt: "2026-03-01T11:03:00Z", responseCapability: { type: "message" } },
    { id: "req-done", kind: "command", status: "resolved" },
  ],
  turnItems: [
    { item: { type: "approval_request", requestId: "req-approval", requestKind: "command", prompt: "Run ls?", reason: "Needs a listing" } },
    { type: "approval_request", requestId: "req-done", requestKind: "command" },
  ],
  visibleTurnItems: [
    {
      item: {
        type: "user_input_request",
        requestId: "req-input",
        questions: [
          {
            id: "q1",
            header: "Mode",
            question: "Which mode?",
            options: [{ label: "Fast", description: "Quick", value: "fast" }, { label: "Slow" }],
            multiSelect: true,
          },
          { id: "q2", question: "Anything else?", allowCustomAnswer: true, required: true },
        ],
      },
    },
    { item: { type: "something_else", requestId: "req-other" } },
  ],
};

test("joins pending requests with their turn items and leaves resolved ones out", () => {
  const { pendingRequests } = toThreadDetail("thread-1", withRequests, undefined);
  assert.deepEqual(
    pendingRequests.map((request) => request.requestId),
    ["req-approval", "req-input", "req-other", "req-orphan"],
  );
});

test("approval request", () => {
  const request = toThreadDetail("thread-1", withRequests, undefined).pendingRequests[0];
  assert.deepEqual(request, {
    category: "approval",
    requestId: "req-approval",
    requestKind: "command",
    prompt: "Run ls?",
    reason: "Needs a listing",
    resumable: true,
  });
});

test("approval prompt and reason default to null", () => {
  const detail = toThreadDetail(
    "thread-1",
    { runtimeRequests: [{ id: "r", kind: "command", status: "pending" }], turnItems: [{ item: { type: "approval_request", requestId: "r", requestKind: "command" } }] },
    undefined,
  );
  const request = detail.pendingRequests[0]!;
  assert.equal(request.category, "approval");
  if (request.category === "approval") assert.deepEqual([request.prompt, request.reason], [null, null]);
});

test("user-input request: value falls back to label, defaults, and not_resumable", () => {
  const request = toThreadDetail("thread-1", withRequests, undefined).pendingRequests[1]!;
  assert.equal(request.category, "user-input");
  assert.equal(request.resumable, false);
  if (request.category !== "user-input") return;
  assert.equal(request.dismissable, false);
  assert.deepEqual(request.questions, [
    {
      id: "q1",
      header: "Mode",
      question: "Which mode?",
      options: [
        { label: "Fast", description: "Quick", value: "fast" },
        { label: "Slow", description: null, value: "Slow" },
      ],
      multiSelect: true,
      allowCustomAnswer: false,
      required: false,
    },
    { id: "q2", header: null, question: "Anything else?", options: [], multiSelect: false, allowCustomAnswer: true, required: true },
  ]);
});

test("user-input request is dismissable only when a message can answer it", () => {
  const dismissable = (type: string) => {
    const projection: RawProjection = {
      runtimeRequests: [{ id: "r", kind: "user_input", status: "pending", responseCapability: { type } }],
      turnItems: [{ type: "user_input_request", requestId: "r", questions: [] }],
    };
    const request = toThreadDetail("thread-1", projection, undefined).pendingRequests[0]!;
    return request.category === "user-input" && request.dismissable;
  };
  assert.deepEqual([dismissable("message"), dismissable("live")], [true, false]);
});

test("unknown item kind or no matching item gives other", () => {
  const [, , other, orphan] = toThreadDetail("thread-1", withRequests, undefined).pendingRequests;
  assert.deepEqual(other, { category: "other", requestId: "req-other", requestKind: "dynamic_tool_call", resumable: true });
  assert.deepEqual(orphan, { category: "other", requestId: "req-orphan", requestKind: "command", resumable: true });
});

const withSubagents: RawProjection = {
  runs: [{ id: "run-1" }, { id: "run-2" }],
  subagents: [
    { id: "old-done", runId: "run-1", title: "Old work", status: "completed", startedAt: "2026-03-01T09:00:00Z", completedAt: "2026-03-01T09:05:00Z", result: "Done" },
    { id: "old-running", runId: "run-1", title: "Still busy", status: "running", progress: "Running ls", startedAt: "2026-03-01T09:10:00Z", completedAt: null },
    { id: "done", runId: "run-2", title: "Explore", status: "completed", progress: "Running cat", startedAt: "2026-03-01T10:00:00Z", completedAt: "2026-03-01T10:02:00Z", result: "x".repeat(500) },
    { id: "failed", runId: "run-2", title: null, prompt: "Review the diff for bugs", status: "interrupted", startedAt: "2026-03-01T10:01:00Z", completedAt: "2026-03-01T10:03:00Z" },
    { id: "live", runId: "run-2", title: "Implement", status: "running", progress: "Running bun test", startedAt: "2026-03-01T10:04:00Z", completedAt: null },
  ],
};

test("subagents: only the latest run, running first then newest first", () => {
  const { subagents } = toThreadDetail("thread-1", withSubagents, undefined);
  assert.deepEqual(
    subagents.map((s) => s.id),
    ["live", "failed", "done"],
  );
});

test("subagents: normalised status, progress only while running, result truncated", () => {
  const [live, failed, done] = toThreadDetail("thread-1", withSubagents, undefined).subagents;
  assert.deepEqual(live, { id: "live", title: "Implement", status: "running", progress: "Running bun test", result: null, startedAt: "2026-03-01T10:04:00Z", completedAt: null, stop: "subagent" });
  assert.equal(failed!.status, "failed");
  assert.equal(failed!.title, "Review the diff for bugs");
  assert.equal(done!.status, "done");
  assert.equal(done!.progress, null);
  assert.equal(done!.result, `${"x".repeat(199)}…`);
});

test("subagents: a running subagent stops itself, a background task stops the thread, a finished one cannot stop", () => {
  const projection: RawProjection = {
    subagents: [
      { id: "live", runId: "run-1", status: "running", startedAt: "2026-03-01T10:04:00Z" },
      { id: "done", runId: "run-1", status: "completed", startedAt: "2026-03-01T10:02:00Z", completedAt: "2026-03-01T10:03:00Z" },
    ],
  };
  const tasks = [{ description: "Shell job" }];
  const { subagents } = toThreadDetail("thread-1", projection, undefined, tasks);
  assert.deepEqual(subagents.map((s) => [s.id, s.stop]), [["live", "subagent"], ["task:Shell job", "thread"], ["done", null]]);
});

test("subagents: an unknown status counts as running only while not completed", () => {
  const projection: RawProjection = {
    subagents: [
      { id: "a", status: "queued", startedAt: "2026-03-01T10:00:00Z", completedAt: null },
      { id: "b", status: "weird", startedAt: "2026-03-01T09:00:00Z", completedAt: "2026-03-01T09:01:00Z" },
    ],
  };
  const subagents = toThreadDetail("thread-1", projection, undefined).subagents;
  assert.deepEqual(
    subagents.map((s) => [s.id, s.status, s.title]),
    [
      ["a", "running", "Subagent"],
      ["b", "done", "Subagent"],
    ],
  );
});

const sub = (id: string, runId: string, status: string, startedAt: string) => ({ id, runId, status, title: id, startedAt });

test("drops a subagent stuck in running from an older run", () => {
  const detail = toThreadDetail("t", {
    runs: [{ id: "r1", startedAt: "2026-03-01T10:00:00Z" }, { id: "r2", startedAt: "2026-03-01T11:00:00Z" }],
    subagents: [sub("old", "r1", "running", "2026-03-01T10:01:00Z"), sub("new", "r2", "completed", "2026-03-01T11:01:00Z")],
  }, undefined);
  assert.deepEqual(detail.subagents.map((s) => s.id), ["new"]);
});

test("picks the latest run by start time when runs are out of order", () => {
  const detail = toThreadDetail("t", {
    runs: [{ id: "r2", startedAt: "2026-03-01T11:00:00Z" }, { id: "r1", startedAt: "2026-03-01T10:00:00Z" }],
    subagents: [sub("old", "r1", "running", "2026-03-01T10:01:00Z"), sub("new", "r2", "running", "2026-03-01T11:01:00Z")],
  }, undefined);
  assert.deepEqual(detail.subagents.map((s) => s.id), ["new"]);
});

test("without runs, keeps the run of the most recently started subagent", () => {
  const detail = toThreadDetail("t", {
    subagents: [sub("old", "r1", "running", "2026-03-01T10:01:00Z"), sub("new", "r2", "completed", "2026-03-01T11:01:00Z")],
  }, undefined);
  assert.deepEqual(detail.subagents.map((s) => s.id), ["new"]);
});

const twoRuns = { runs: [{ id: "r1", startedAt: "2026-03-01T10:00:00Z" }, { id: "r2", startedAt: "2026-03-01T11:00:00Z" }] };

test("keeps an older-run subagent that a pending background task still names", () => {
  const detail = toThreadDetail("t", {
    ...twoRuns,
    subagents: [
      { ...sub("by-child", "r1", "running", "2026-03-01T10:01:00Z"), childThreadId: "child-1" },
      { ...sub("by-native", "r1", "running", "2026-03-01T10:02:00Z"), nativeTaskRef: { nativeId: "task-2" } },
      { ...sub("by-title", "r1", "running", "2026-03-01T10:03:00Z"), title: "Explore the API" },
      sub("stale", "r1", "running", "2026-03-01T10:04:00Z"),
      sub("new", "r2", "completed", "2026-03-01T11:01:00Z"),
    ],
  }, undefined, [
    { taskId: "task-1", childThreadId: "child-1" },
    { taskId: "task-2" },
    { description: "Explore the API" },
  ]);
  assert.deepEqual(detail.subagents.map((s) => s.id).sort(), ["by-child", "by-native", "by-title", "new"]);
});

test("a pending background task without a projection subagent shows as a running row", () => {
  const detail = toThreadDetail("t", { ...twoRuns, subagents: [sub("new", "r2", "completed", "2026-03-01T11:01:00Z")] }, undefined, [
    { taskId: "task-9", description: "Review the diff", kind: "subagent" },
    { taskId: "task-10" },
  ]);
  assert.deepEqual(
    detail.subagents.map((s) => [s.id, s.title, s.status]),
    [
      ["task:task-9", "Review the diff", "running"],
      ["task:task-10", "Subagent", "running"],
      ["new", "new", "done"],
    ],
  );
});

test("orphan rows count only kept subagents; a title never overrides ids", () => {
  const detail = toThreadDetail("t", {
    ...twoRuns,
    subagents: [
      { ...sub("old-done", "r1", "completed", "2026-03-01T10:01:00Z"), childThreadId: "child-1" },
      { ...sub("same-title", "r1", "running", "2026-03-01T10:02:00Z"), title: "Explore" },
    ],
  }, undefined, [
    { taskId: "task-1", childThreadId: "child-1", description: "Other" },
    { taskId: "task-2", description: "Explore" },
  ]);
  assert.deepEqual(detail.subagents.map((s) => s.id).sort(), ["task:task-1", "task:task-2"]);
});

test("activity: null without runs", () => {
  assert.equal(toThreadDetail("t", {}, undefined).activity, null);
});

test("activity: the thread's active run, else the latest run, with its times", () => {
  const runs = [
    { id: "r1", status: "running", startedAt: "2026-03-01T10:00:00Z", completedAt: null },
    { id: "r2", status: "completed", startedAt: "2026-03-01T11:00:00Z", completedAt: "2026-03-01T11:12:00Z" },
  ];
  const active = toThreadDetail("t", { runs, thread: { id: "t", activeRunId: "r1" } }, undefined).activity;
  assert.deepEqual(active, { runId: "r1", startedAt: "2026-03-01T10:00:00Z", completedAt: null, items: [] });
  const latest = toThreadDetail("t", { runs }, undefined).activity;
  assert.deepEqual(latest, { runId: "r2", startedAt: "2026-03-01T11:00:00Z", completedAt: "2026-03-01T11:12:00Z", items: [] });
});

const item = (id: string, type: string, ordinal: number, extra: Record<string, unknown> = {}) => ({ id, type, runId: "r1", ordinal, status: "completed", completedAt: "2026-03-01T10:05:00Z", ...extra });
const activityRun = { runs: [{ id: "r1", status: "running", startedAt: "2026-03-01T10:00:00Z" }], thread: { id: "t", activeRunId: "r1" } };

test("activity: maps each work item of the run in ordinal order and skips messages and bookkeeping", () => {
  const detail = toThreadDetail("t", {
    ...activityRun,
    turnItems: [
      item("cmd", "command_execution", 4, { input: "bun test" }),
      item("think", "reasoning", 2, { title: "Thinking", text: "Check the tests first" }),
      item("user", "user_message", 1, { text: "go" }),
      { item: item("edit", "file_change", 5, { fileName: "/repo/src/a.ts" }) },
      item("tool", "dynamic_tool", 6, { toolName: "mcp__server-x__preview_open", input: { url: "http://localhost:3000" } }),
      item("sub", "subagent", 7, { title: "Explore", status: "running", completedAt: null }),
      item("reply", "assistant_message", 8, { text: "Done" }),
      item("cp", "checkpoint", 9),
      item("other-run", "command_execution", 3, { runId: "r0", input: "ls" }),
    ],
  }, undefined);
  assert.deepEqual(detail.activity!.items, [
    { id: "think", kind: "thinking", text: "Check the tests first", detail: null, status: "done" },
    { id: "cmd", kind: "command", text: "bun test", detail: null, status: "done" },
    { id: "edit", kind: "file", text: "/repo/src/a.ts", detail: null, status: "done" },
    { id: "tool", kind: "tool", text: "preview_open", detail: "http://localhost:3000", status: "done" },
    { id: "sub", kind: "subagent", text: "Explore", detail: null, status: "running" },
  ]);
});

test("activity: failures, live items, fallbacks and truncation", () => {
  const long = "y".repeat(400);
  const detail = toThreadDetail("t", {
    ...activityRun,
    turnItems: [
      item("failed-flag", "command_execution", 1, { input: "false", outputIndicatesFailure: true }),
      item("exit", "command_execution", 2, { input: "exit 2", exitCode: 2 }),
      item("failed", "dynamic_tool", 3, { toolName: "Skill", title: "Skill: review", status: "failed", input: { skill: "review" } }),
      item("live", "reasoning", 4, { title: "Thinking", text: "", status: "running", completedAt: null }),
      item("long", "reasoning", 5, { text: long }),
      item("no-summary", "dynamic_tool", 6, { toolName: "Probe", input: { flag: true } }),
      item("prompt", "subagent", 7, { title: null, prompt: "Review the diff" }),
    ],
  }, undefined);
  assert.deepEqual(
    detail.activity!.items.map((i) => [i.id, i.text, i.detail, i.status]),
    [
      ["failed-flag", "false", null, "failed"],
      ["exit", "exit 2", null, "failed"],
      ["failed", "Skill: review", "review", "failed"],
      ["live", "Thinking", null, "running"],
      ["long", `${"y".repeat(299)}…`, null, "done"],
      ["no-summary", "Probe", null, "done"],
      ["prompt", "Review the diff", null, "done"],
    ],
  );
});

test("activity: keeps only the latest items of a long run", () => {
  const turnItems = Array.from({ length: 250 }, (_, n) => item(`c${n}`, "command_execution", n, { input: `step ${n}` }));
  const items = toThreadDetail("t", { ...activityRun, turnItems }, undefined).activity!.items;
  assert.equal(items.length, 200);
  assert.deepEqual([items[0]!.id, items.at(-1)!.id], ["c50", "c249"]);
});

test("keeps the images a message carries", () => {
  const detail = toThreadDetail("t", {
    messages: [{ id: "m1", role: "user", text: "", attachments: [{ type: "image", id: "t-a", name: "shot.png" }, { type: "file", id: "t-b", name: "notes.txt" }] }],
    visibleTurnItems: [{ item: { type: "message", messageId: "m1" } }],
  }, undefined);
  assert.deepEqual(detail.messages[0]?.attachments, [{ id: "t-a", name: "shot.png" }]);
});

test("lists html_render pages once, oldest first", () => {
  const render = (id: string, at: string) => ({ id, type: "dynamic_tool", completedAt: at, output: { htmlRender: { attachmentId: `t-${id}-html`, title: id, height: 320 } } });
  const detail = toThreadDetail("t", {
    turnItems: [render("b", "2026-03-01T10:00:05Z"), render("a", "2026-03-01T10:00:01Z"), { id: "x", type: "dynamic_tool", output: { text: "no page" } }],
    visibleTurnItems: [{ item: render("b", "2026-03-01T10:00:05Z") }],
  }, undefined);
  assert.deepEqual(detail.renders, [
    { id: "a", attachmentId: "t-a-html", title: "a", height: 320, createdAt: "2026-03-01T10:00:01Z" },
    { id: "b", attachmentId: "t-b-html", title: "b", height: 320, createdAt: "2026-03-01T10:00:05Z" },
  ]);
});

const queuedProjection = (extra: Partial<RawProjection> = {}): RawProjection => ({
  messages: [
    { id: "m1", role: "user", text: "Start", createdAt: "2026-03-01T10:00:00Z" },
    { id: "q-late", role: "user", text: "second", createdAt: "2026-03-01T10:00:02Z" },
    { id: "q-first", role: "user", text: "first", createdAt: "2026-03-01T10:00:03Z", context: { guest: { text: "guest text" } } },
  ],
  visibleTurnItems: [{ item: { type: "user_message", messageId: "m1", runId: "r1" } }],
  runs: [
    { id: "r1", status: "running", startedAt: "2026-03-01T10:00:00Z" },
    { id: "r-late", status: "queued", userMessageId: "q-late", ordinal: 2, createdAt: "2026-03-01T10:00:02Z" },
    { id: "r-first", status: "queued", userMessageId: "q-first", ordinal: 3, queuePosition: 1, createdAt: "2026-03-01T10:00:03Z" },
  ],
  ...extra,
});

test("queued runs form the queue in T3 order, with the guest text first, and stay out of the messages", () => {
  const detail = toThreadDetail("t", queuedProjection({ visibleTurnItems: [{ item: { type: "user_message", messageId: "m1" } }, { item: { type: "user_message", messageId: "q-late" } }] }), undefined);
  assert.deepEqual(detail.queue.map((item) => [item.runId, item.messageId, item.text]), [["r-first", "q-first", "guest text"], ["r-late", "q-late", "second"]]);
  assert.deepEqual(detail.messages.map((message) => message.id), ["m1"]);
  assert.equal(detail.queueHeld, false);
});

test("the queue works when T3 lists no visible item for the queued message", () => {
  const detail = toThreadDetail("t", queuedProjection(), undefined);
  assert.equal(detail.queue.length, 2);
  assert.deepEqual(detail.messages.map((message) => message.id), ["m1"]);
});

test("a cancelled queued_turn message stays hidden, a promoted one shows", () => {
  const projection = queuedProjection({
    runs: [
      { id: "r1", status: "running", startedAt: "2026-03-01T10:00:00Z" },
      { id: "r-late", status: "cancelled", userMessageId: "q-late" },
      { id: "r-first", status: "running", userMessageId: "q-first" },
    ],
    visibleTurnItems: [
      { item: { type: "user_message", messageId: "m1" } },
      { item: { type: "user_message", messageId: "q-late", runId: "r-late", inputIntent: "queued_turn" } },
      { item: { type: "user_message", messageId: "q-first", runId: "r1", inputIntent: "promoted_queued_to_steer" } },
    ],
  });
  const detail = toThreadDetail("t", projection, undefined);
  assert.deepEqual(detail.messages.map((message) => message.id), ["m1", "q-first"]);
  assert.deepEqual(detail.queue, []);
});

test("queueHeld is true when a queued run is held", () => {
  const projection = queuedProjection();
  projection.runs![1] = { ...projection.runs![1]!, queueHeld: true };
  assert.equal(toThreadDetail("t", projection, undefined).queueHeld, true);
});

test("a queued run does not take over the activity of the latest run", () => {
  const detail = toThreadDetail("t", queuedProjection({ turnItems: [{ id: "a1", type: "reasoning", runId: "r1", text: "thinking", ordinal: 1 }] }), undefined);
  assert.equal(detail.activity?.runId, "r1");
  assert.equal(detail.activity?.items.length, 1);
});

test("like T3, the queue skips delegated completions and notifications, and a guest message is not editable", () => {
  const projection = queuedProjection();
  projection.messages![1] = { ...projection.messages![1]!, notification: { kind: "x" } };
  const detail = toThreadDetail("t", projection, undefined);
  assert.deepEqual(detail.queue.map((item) => [item.runId, item.editable]), [["r-first", false]]);
});

test("a run removed from the queue before it started does not take over the activity", () => {
  const projection = queuedProjection({ turnItems: [{ id: "a1", type: "reasoning", runId: "r1", text: "thinking", ordinal: 1 }] });
  projection.runs![1] = { ...projection.runs![1]!, status: "cancelled", createdAt: "2026-03-02T10:00:00Z" };
  assert.equal(toThreadDetail("t", projection, undefined).activity?.runId, "r1");
});

test("a sent queued message takes its item's place and time, after the replies written while it waited", () => {
  const detail = toThreadDetail(
    "t",
    {
      messages: [
        { id: "u1", role: "user", text: "start", createdAt: "2026-03-01T10:00:00Z" },
        { id: "q", role: "user", text: "queued", createdAt: "2026-03-01T10:00:05Z" },
        { id: "a1", role: "assistant", text: "reply", createdAt: "2026-03-01T10:00:10Z" },
      ],
      visibleTurnItems: [
        { item: { type: "user_message", messageId: "u1", startedAt: "2026-03-01T10:00:00Z" } },
        { item: { type: "assistant_message", messageId: "a1", startedAt: "2026-03-01T10:00:10Z" } },
        { item: { type: "user_message", messageId: "q", inputIntent: "queued_turn", startedAt: "2026-03-01T10:00:20Z" } },
      ],
    },
    undefined,
  );
  assert.deepEqual(detail.messages.map((message) => [message.id, message.createdAt]), [["u1", "2026-03-01T10:00:00Z"], ["a1", "2026-03-01T10:00:10Z"], ["q", "2026-03-01T10:00:20Z"]]);
});
