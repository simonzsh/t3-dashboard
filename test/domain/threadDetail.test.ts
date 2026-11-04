import assert from "node:assert/strict";
import { test } from "bun:test";
import { rewindPoints, toStepDetail, toThreadDetail } from "../../src/domain/threadDetail.ts";
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
    { id: "m1", role: "user", text: "Hello", createdAt: "2026-03-01T10:00:00Z", streaming: false, attachments: [], rewindable: false },
    { id: "m2", role: "assistant", text: "Hi there", createdAt: "2026-03-01T10:00:02Z", streaming: true, attachments: [], rewindable: false },
  ]);
  assert.equal(detail.threadId, "thread-1");
  assert.equal(detail.thread, null);
});

test("passes the store thread through", () => {
  const thread = { id: "thread-1" } as never;
  assert.equal(toThreadDetail("thread-1", projection, thread).thread, thread);
});

test("title and subagentThread come from the projection's own thread", () => {
  const sub = { id: "c", title: " Child ", lineage: { relationshipToParent: "subagent" }, creationSource: "provider" };
  assert.deepEqual([toThreadDetail("c", { thread: sub }, undefined).title, toThreadDetail("c", { thread: sub }, undefined).subagentThread], ["Child", true]);
  assert.equal(toThreadDetail("c", { thread: { ...sub, archivedAt: "2026-03-01T10:00:00Z" } }, undefined).subagentThread, false);
  assert.deepEqual([toThreadDetail("t", { thread: { id: "t", title: "Main" } }, undefined).subagentThread, toThreadDetail("t", {}, undefined).title], [false, null]);
});

test("a subagent thread names its parent, any other thread names none", () => {
  const sub = { id: "c", lineage: { relationshipToParent: "subagent", parentThreadId: "p" }, creationSource: "provider" };
  assert.equal(toThreadDetail("c", { thread: sub }, undefined).parentThreadId, "p");
  assert.equal(toThreadDetail("f", { thread: { id: "f", lineage: { relationshipToParent: "fork", parentThreadId: "p" } } }, undefined).parentThreadId, null);
  assert.equal(toThreadDetail("t", {}, undefined).parentThreadId, null);
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
  assert.deepEqual(active, { runId: "r1", startedAt: "2026-03-01T10:00:00Z", completedAt: null });
  const latest = toThreadDetail("t", { runs }, undefined).activity;
  assert.deepEqual(latest, { runId: "r2", startedAt: "2026-03-01T11:00:00Z", completedAt: "2026-03-01T11:12:00Z" });
});

const item = (id: string, type: string, ordinal: number, extra: Record<string, unknown> = {}) => ({ id, type, runId: "r1", ordinal, status: "completed", completedAt: "2026-03-01T10:05:00Z", ...extra });
const activityRun = { runs: [{ id: "r1", status: "running", startedAt: "2026-03-01T10:00:00Z" }], thread: { id: "t", activeRunId: "r1" } };

const stepsOf = (turnItems: unknown[], extra: Partial<RawProjection> = {}, threadId = "t") => toThreadDetail(threadId, { ...activityRun, turnItems, ...extra } as RawProjection, undefined);

test("steps: maps each work item in ordinal order and skips messages and unknown types", () => {
  const detail = stepsOf([
    item("cmd", "command_execution", 4, { input: "bun test", exitCode: 0, startedAt: "2026-03-01T10:01:00Z" }),
    item("think", "reasoning", 2, { title: "Thinking", text: "Check the tests first" }),
    item("user", "user_message", 1, { text: "go" }),
    { item: item("edit", "file_change", 5, { fileName: "/repo/src/a.ts", additions: 3, deletions: 1 }) },
    item("tool", "dynamic_tool", 6, { toolName: "mcp__server-x__preview_open", input: { url: "http://localhost:3000" } }),
    item("reply", "assistant_message", 8, { text: "Done" }),
    item("weird", "something_new", 9),
  ]);
  assert.deepEqual(detail.steps.map((step) => [step.id, step.kind, step.text, step.detail, step.status, step.expandable]), [
    ["think", "thinking", "Check the tests first", null, "done", false],
    ["cmd", "command", "bun test", null, "done", true],
    ["edit", "file", "/repo/src/a.ts", "+3 −1", "done", true],
    ["tool", "tool", "preview_open", "http://localhost:3000", "done", true],
  ]);
  assert.deepEqual(detail.steps[1], { id: "cmd", runId: "r1", kind: "command", status: "done", startedAt: "2026-03-01T10:01:00Z", completedAt: "2026-03-01T10:05:00Z", text: "bun test", detail: null, expandable: true, exitCode: 0 });
  assert.equal(detail.stepsOmitted, 0);
});

test("steps: failures, live items, fallbacks and truncation", () => {
  const long = "y".repeat(400);
  const detail = stepsOf([
    item("failed-flag", "command_execution", 1, { input: "false", outputIndicatesFailure: true }),
    item("exit", "command_execution", 2, { input: "exit 2", exitCode: 2 }),
    item("failed", "dynamic_tool", 3, { toolName: "Skill", title: "Skill: review", status: "failed", input: { skill: "review" } }),
    item("live", "reasoning", 4, { title: "Thinking", text: "", status: "running", completedAt: null }),
    item("long", "reasoning", 5, { text: long }),
    item("no-summary", "dynamic_tool", 6, { toolName: "Probe", input: { flag: true } }),
  ]);
  assert.deepEqual(detail.steps.map((step) => [step.id, step.text, step.detail, step.status, step.exitCode]), [
    ["failed-flag", "false", null, "failed", null],
    ["exit", "exit 2", null, "failed", 2],
    ["failed", "Skill: review", "review", "failed", null],
    ["live", "Thinking", null, "running", null],
    ["long", `${"y".repeat(299)}…`, null, "done", null],
    ["no-summary", "Probe", null, "done", null],
  ]);
  assert.equal(detail.steps[4]!.expandable, true);
});

test("steps: every run shows, each item once, and the cap keeps the latest 400", () => {
  const turnItems = Array.from({ length: 450 }, (_, n) => item(`c${n}`, "command_execution", n, { input: `step ${n}`, runId: n < 100 ? "r0" : "r1" }));
  const detail = stepsOf(turnItems, { visibleTurnItems: [{ visibility: "local", item: turnItems[449] }] as RawProjection["visibleTurnItems"] });
  assert.equal(detail.steps.length, 400);
  assert.equal(detail.stepsOmitted, 50);
  assert.deepEqual([detail.steps[0]!.id, detail.steps.at(-1)!.id], ["c50", "c449"]);
  assert.equal(detail.steps[0]!.runId, "r0");
});

test("steps: skips inherited items and items of another thread", () => {
  const detail = stepsOf(
    [item("other", "command_execution", 1, { input: "x", threadId: "parent" }), item("mine", "command_execution", 2, { input: "y", threadId: "t" })],
    { visibleTurnItems: [{ visibility: "inherited", item: item("inherited", "reasoning", 0, { text: "old" }) }, { visibility: "local", item: item("local", "reasoning", 3, { text: "new" }) }] as RawProjection["visibleTurnItems"] },
  );
  assert.deepEqual(detail.steps.map((step) => step.id), ["mine", "local"]);
});

test("steps: todo list, plan, search and notices", () => {
  const detail = stepsOf([
    item("todo", "todo_list", 1, { explanation: "Release", steps: [{ id: "a", text: "Tag", status: "completed" }, { id: "b", text: "Publish", status: "running" }, { id: "c", text: "Announce", status: "weird" }] }),
    item("plan", "proposed_plan", 2, { markdown: "# Plan" }),
    item("fs", "file_search", 3, { pattern: "rateLimit", results: [{ fileName: "a.ts" }, { fileName: "b.ts" }] }),
    item("ws", "web_search", 4, { patterns: ["one", "two"], results: [{ title: "T", url: "https://x.test" }] }),
    item("cp", "checkpoint", 5, { files: [{}, {}], filesTotal: 7 }),
    item("cmp", "compaction", 6, { beforeTokenCount: 900, afterTokenCount: 100 }),
    item("err", "error", 7, { failure: { class: "provider", message: "Overloaded" } }),
    item("sys", "system_notice", 8, { message: "Model switched" }),
    item("int", "run_interrupt_result", 9, { message: "Stopped" }),
  ]);
  const [todo, plan, search, web, checkpoint, compaction, error, system, interrupt] = detail.steps;
  assert.deepEqual([todo!.text, todo!.todos], ["Release", [{ text: "Tag", status: "completed" }, { text: "Publish", status: "running" }, { text: "Announce", status: "pending" }]]);
  assert.deepEqual([plan!.kind, plan!.text, plan!.markdown], ["plan", "Proposed plan", "# Plan"]);
  assert.deepEqual([search!.kind, search!.text, search!.detail, search!.expandable], ["search", "rateLimit", "2 results", true]);
  assert.deepEqual([web!.kind, web!.text, web!.detail], ["web", "one, two", "1 result"]);
  assert.deepEqual([checkpoint!.notice, checkpoint!.detail], ["checkpoint", "7 files"]);
  assert.deepEqual([compaction!.notice, compaction!.detail], ["compaction", "900 → 100 tokens"]);
  assert.deepEqual([error!.notice, error!.text, error!.status], ["error", "Overloaded", "failed"]);
  assert.deepEqual([system!.notice, system!.text], ["system", "Model switched"]);
  assert.deepEqual([interrupt!.notice, interrupt!.text], ["interrupt", "Stopped"]);
});

test("steps: caps the todo list and the plan", () => {
  const many = Array.from({ length: 60 }, (_, n) => ({ id: `s${n}`, text: `step ${n}`, status: "pending" }));
  const [todo, plan] = stepsOf([item("todo", "todo_list", 1, { steps: many }), item("plan", "proposed_plan", 2, { markdown: "p".repeat(25_000) })]).steps;
  assert.equal(todo!.text, "Plan");
  assert.equal(todo!.todos!.length, 50);
  assert.equal(plan!.markdown!.length, 20_000);
});

test("steps: a subagent step carries its ids, progress and whether Stop applies", () => {
  const raw = [{ id: "sub-1", runId: "r1", status: "running", childThreadId: "child-from-raw", progress: "from raw" }, { id: "sub-2", status: "running" }, { id: "sub-3", runId: "r1", status: "completed", result: "All good." }];
  const detail = stepsOf(
    [
      item("a", "subagent", 1, { subagentId: "sub-1", title: "Explore", status: "running", completedAt: null, progress: "Reading files", childThreadId: "child-1" }),
      item("b", "subagent", 2, { nodeId: "sub-2", prompt: "Review the diff", status: "running", completedAt: null }),
      item("c", "subagent", 3, { subagentId: "sub-3", title: "Done one", result: "All good, with details." }),
      item("d", "subagent", 4, { subagentId: "sub-1", title: "No ids", progress: null, childThreadId: null }),
    ],
    { subagents: raw },
  );
  const [a, b, c, d] = detail.steps;
  assert.deepEqual(a!.subagent, { subagentId: "sub-1", childThreadId: "child-1", progress: "Reading files", stoppable: true, state: "running", provider: null, turnId: null });
  assert.deepEqual(b!.subagent, { subagentId: "sub-2", childThreadId: null, progress: null, stoppable: false, state: "running", provider: null, turnId: null });
  assert.deepEqual([c!.status, c!.detail, c!.expandable, c!.subagent], ["done", "All good, with details.", true, { subagentId: "sub-3", childThreadId: null, progress: null, stoppable: false, state: "completed", provider: null, turnId: null }]);
  assert.equal(d!.subagent!.childThreadId, "child-from-raw");
});

test("keeps the images and files a message carries", () => {
  const detail = toThreadDetail("t", {
    messages: [{ id: "m1", role: "user", text: "", attachments: [{ type: "image", id: "t-a", name: "shot.png", mimeType: "image/png", sizeBytes: 12 }, { type: "file", id: "t-b", name: "notes.txt" }, { type: "audio", id: "t-c", name: "x.mp3" }] }],
    visibleTurnItems: [{ item: { type: "message", messageId: "m1" } }],
  }, undefined);
  assert.deepEqual(detail.messages[0]?.attachments, [
    { id: "t-a", name: "shot.png", kind: "image", mimeType: "image/png", sizeBytes: 12 },
    { id: "t-b", name: "notes.txt", kind: "file", mimeType: null, sizeBytes: null },
  ]);
});

test("toStepDetail: a command unwraps JSON stdout then stderr, and keeps the exit code", () => {
  const detail = toStepDetail({ id: "c", type: "command_execution", input: "bun test", output: JSON.stringify({ stdout: "ok", stderr: "warn", interrupted: false }), exitCode: 1 });
  assert.deepEqual(detail, { id: "c", kind: "command", input: "bun test", output: "ok\nwarn", exitCode: 1, diff: null, text: null, results: [], truncated: false });
  assert.equal(toStepDetail({ id: "c", type: "command_execution", input: "ls", output: "plain\ntext" }).output, "plain\ntext");
});

test("toStepDetail: a tool shows its input as JSON and its output as text", () => {
  const input = { query: "x" };
  assert.deepEqual(
    [toStepDetail({ id: "t", type: "dynamic_tool", input, output: [{ type: "text", text: "one" }, { type: "text", text: "two" }] }).input, toStepDetail({ id: "t", type: "dynamic_tool", output: [{ type: "text", text: "one" }, { type: "text", text: "two" }] }).output],
    [JSON.stringify(input, null, 2), "one\ntwo"],
  );
  assert.equal(toStepDetail({ id: "t", type: "dynamic_tool", output: { content: [{ type: "text", text: "wrapped" }] } }).output, "wrapped");
  assert.equal(toStepDetail({ id: "t", type: "dynamic_tool", output: "as is" }).output, "as is");
  assert.equal(toStepDetail({ id: "t", type: "dynamic_tool", output: { rows: 2 } }).output, JSON.stringify({ rows: 2 }, null, 2));
});

test("toStepDetail: a file change gives its diff, or a simple one from the old and new text", () => {
  assert.equal(toStepDetail({ id: "f", type: "file_change", fileName: "a.ts", diffStr: "--- a\n+++ b" }).diff, "--- a\n+++ b");
  assert.equal(
    toStepDetail({ id: "f", type: "file_change", fileName: "a.ts", oldStr: "one\ntwo", newStr: "one\nthree" }).diff,
    "--- a/a.ts\n+++ b/a.ts\n@@ -1,2 +1,2 @@\n-one\n-two\n+one\n+three",
  );
  assert.equal(toStepDetail({ id: "f", type: "file_change", fileName: "new.ts", newStr: "x" }).diff, "--- /dev/null\n+++ b/new.ts\n@@ -0,0 +1,1 @@\n+x");
  assert.equal(toStepDetail({ id: "f", type: "file_change", fileName: "a.ts" }).diff, null);
});

test("toStepDetail: full texts and search results", () => {
  assert.equal(toStepDetail({ id: "r", type: "reasoning", text: "all the thinking" }).text, "all the thinking");
  assert.equal(toStepDetail({ id: "s", type: "subagent", result: "the result" }).text, "the result");
  assert.equal(toStepDetail({ id: "p", type: "proposed_plan", markdown: "# P" }).text, "# P");
  const { kind, results } = toStepDetail({ id: "w", type: "web_search", results: [{ title: "T", url: "https://x.test", snippet: "S" }, { fileName: "a.ts", preview: "code" }] });
  assert.equal(kind, "web");
  assert.deepEqual(results, [{ title: "T", url: "https://x.test", snippet: "S" }, { title: "a.ts", url: null, snippet: "code" }]);
});

test("toStepDetail: a subagent without its own result takes the projection's", () => {
  const projection = { subagents: [{ id: "sa", result: "from projection" }] };
  assert.equal(toStepDetail({ id: "s", type: "subagent", subagentId: "sa" }, projection).text, "from projection");
  assert.equal(toStepDetail({ id: "s", type: "subagent", subagentId: "sa", result: "own" }, projection).text, "own");
});

test("toStepDetail: caps every text and says so", () => {
  const command = toStepDetail({ id: "c", type: "command_execution", input: "i".repeat(25_000), output: `${"a".repeat(10)}${"z".repeat(64_000)}` });
  assert.equal(command.input!.length, 20_000);
  assert.equal(command.output, "z".repeat(64_000));
  assert.equal(command.truncated, true);
  assert.equal(toStepDetail({ id: "f", type: "file_change", diffStr: "d".repeat(250_000) }).diff!.length, 200_000);
  assert.equal(toStepDetail({ id: "r", type: "reasoning", text: "t".repeat(70_000) }).text!.length, 64_000);
  const results = Array.from({ length: 60 }, (_, n) => ({ title: `r${n}` }));
  const search = toStepDetail({ id: "w", type: "web_search", results });
  assert.deepEqual([search.results.length, search.truncated], [50, true]);
  assert.equal(toStepDetail({ id: "c", type: "command_execution", input: "ls", output: "ok" }).truncated, false);
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
  assert.equal(detail.steps.length, 1);
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

const checkpoint = (id: string, ordinal: number, runId: string | null, status = "ready") => ({ id, scopeId: "scope", runId, status, ordinalWithinScope: ordinal, appRunOrdinal: runId ? ordinal : null });
const rewindProjection = (extra: Partial<RawProjection> = {}): RawProjection => ({
  messages: [
    { id: "u1", role: "user", text: "first" },
    { id: "a1", role: "assistant", text: "ok" },
    { id: "u2", role: "user", text: "second" },
    { id: "a2", role: "assistant", text: "ok" },
  ],
  visibleTurnItems: ["u1", "a1", "u2", "a2"].map((messageId) => ({ item: { type: "message", messageId } })),
  runs: [
    { id: "r1", ordinal: 1, status: "completed", userMessageId: "u1", startedAt: "2026-03-01T10:00:00Z" },
    { id: "r2", ordinal: 2, status: "completed", userMessageId: "u2", startedAt: "2026-03-01T10:05:00Z" },
  ],
  checkpoints: [checkpoint("c0", 0, null), checkpoint("c1", 1, "r1"), checkpoint("c2", 2, "r2")],
  ...extra,
});
const rewindable = (projection: RawProjection) => toThreadDetail("t", projection, undefined).messages.map((message) => [message.id, message.rewindable]);

test("a user message is rewindable once the checkpoint before its run is ready", () => {
  assert.deepEqual(rewindable(rewindProjection()), [["u1", true], ["a1", false], ["u2", true], ["a2", false]]);
});

test("rewind points: the first message returns to the start checkpoint, the next to the run before", () => {
  const points = rewindPoints(rewindProjection());
  assert.deepEqual([...points], [["u1", { scopeId: "scope", checkpointId: "c0" }], ["u2", { scopeId: "scope", checkpointId: "c1" }]]);
});

test("a message is not rewindable without its checkpoint, or while its run is active", () => {
  assert.deepEqual(rewindable(rewindProjection({ checkpoints: [checkpoint("c0", 0, null, "preparing"), checkpoint("c1", 1, "r1")] })), [["u1", false], ["a1", false], ["u2", true], ["a2", false]]);
  assert.deepEqual(rewindable(rewindProjection({ checkpoints: [] })), [["u1", false], ["a1", false], ["u2", false], ["a2", false]]);
  const running = rewindProjection({ runs: [{ id: "r1", ordinal: 1, status: "completed", userMessageId: "u1" }, { id: "r2", ordinal: 2, status: "running", userMessageId: "u2" }] });
  assert.deepEqual(rewindable(running).filter(([, flag]) => flag), [["u1", true]]);
});

test("a queued run does not count as the run before a message", () => {
  const queued = rewindProjection({ runs: [{ id: "r1", ordinal: 1, status: "completed", userMessageId: "u1" }, { id: "rq", ordinal: 2, status: "queued", userMessageId: "uq" }, { id: "r2", ordinal: 3, status: "completed", userMessageId: "u2" }] });
  assert.equal(rewindPoints(queued).get("u2")?.checkpointId, "c1");
});

const usage = (usedTokens: number, updatedAt: string, maxTokens?: number) => ({ tokenUsage: { usedTokens, updatedAt, ...(maxTokens && { maxTokens }) } });

test("contextUsage: null until a turn reports it", () => {
  assert.equal(toThreadDetail("t", {}, undefined).contextUsage, null);
  assert.equal(toThreadDetail("t", { providerTurns: [{}] }, undefined).contextUsage, null);
});

test("contextUsage: the turn report with the latest time wins", () => {
  const providerTurns = [usage(1000, "2026-03-01T10:00:00Z", 200000), usage(722000, "2026-03-01T12:00:00Z", 1000000), usage(5, "2026-03-01T11:00:00Z")];
  assert.deepEqual(toThreadDetail("t", { providerTurns }, undefined).contextUsage, { usedTokens: 722000, maxTokens: 1000000, updatedAt: "2026-03-01T12:00:00Z", promptCacheTtlMs: null });
});

test("contextUsage: falls back to the active provider thread, and keeps a missing limit null", () => {
  const providerThreads = [
    { id: "p1", contextUsage: { usedTokens: 10, maxTokens: 20 } },
    { id: "p2", contextUsage: { usedTokens: 300 } },
  ];
  const thread = { id: "t", activeProviderThreadId: "p2" };
  assert.deepEqual(toThreadDetail("t", { providerThreads, thread }, undefined).contextUsage, { usedTokens: 300, maxTokens: null, updatedAt: null, promptCacheTtlMs: null });
  assert.equal(toThreadDetail("t", { providerThreads: [{ id: "p2", contextUsage: null }], thread }, undefined).contextUsage, null);
});

test("a subagent step carries its provider, turn and T3 status", () => {
  const item = (id: string, status: string, extra = {}) => ({ id, type: "subagent", threadId: "t", ordinal: 1, status, subagentId: id, startedAt: "2026-03-01T10:00:00Z", providerTurnId: "turn-1", ...extra });
  const detail = toThreadDetail("t", {
    turnItems: [item("a", "pending", { driver: "codex", providerInstanceId: "codex-2" }), item("b", "interrupted", { driver: "claudeAgent" }), item("c", "waiting"), item("d", "weird")],
    subagents: [{ id: "c", runId: "r", status: "waiting", providerInstanceId: "claude-main" }],
  }, undefined);
  const by = Object.fromEntries(detail.steps.map((s) => [s.id, s.subagent!]));
  assert.deepEqual([by.a!.state, by.a!.provider, by.a!.turnId], ["queued", "codex-2", "turn-1"]);
  assert.deepEqual([by.b!.state, by.b!.provider], ["stopped", "claudeAgent"]);
  assert.deepEqual([by.c!.state, by.c!.provider], ["waiting", "claude-main"]);
  assert.deepEqual([by.d!.state, by.d!.provider], ["running", null]);
});
