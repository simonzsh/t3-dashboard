import type { ChatAttachment, ChatMessage, DashboardThread, HtmlRender, RunActivity, PendingRequestDetail, QueuedMessage, StepDetail, StepKind, StepStatus, SubagentInfo, ThreadDetail, TodoEntry, TurnStep } from "../../shared/api.ts";
import { FAILED_STATUSES, RUNNING_RUN_STATUSES } from "../../shared/status.ts";
import { isSubagentThread } from "./classify.ts";
import { isRuntimeMode } from "../../shared/limits.ts";
import type { RawBackgroundTask, RawMessage, RawProjection, RawRuntimeRequest, RawSubagent, RawTurnItem, TurnItemEntry } from "../integrations/t3/schemas.ts";

// Turn items arrive wrapped as `{item}` in some payloads and bare in others.
const entryOf = (element: TurnItemEntry): { item: RawTurnItem; visibility?: string | null } =>
  "item" in element && element.item ? { item: element.item, visibility: element.visibility } : { item: element as RawTurnItem };
const unwrap = (element: TurnItemEntry): RawTurnItem => entryOf(element).item;

function pendingDetail(request: RawRuntimeRequest, items: RawTurnItem[]): PendingRequestDetail {
  const base = { requestId: request.id, resumable: request.responseCapability?.type !== "not_resumable" };
  const item = items.find((candidate) => candidate.requestId === request.id);
  if (item?.type === "approval_request") {
    return { category: "approval", ...base, requestKind: item.requestKind ?? request.kind ?? "", prompt: item.prompt ?? null, reason: item.reason ?? null };
  }
  if (item?.type === "user_input_request") {
    const questions = (item.questions ?? []).map((question) => ({
      id: question.id,
      header: question.header ?? null,
      question: question.question ?? "",
      options: (question.options ?? []).map((option) => ({ label: option.label, description: option.description ?? null, value: option.value ?? option.label })),
      multiSelect: question.multiSelect ?? false,
      allowCustomAnswer: question.allowCustomAnswer ?? false,
      required: question.required ?? false,
    }));
    return { category: "user-input", ...base, questions, dismissable: request.kind === "user_input" && request.responseCapability?.type === "message" };
  }
  return { category: "other", ...base, requestKind: request.kind ?? "" };
}

const RESULT_CHARS = 200;

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function subagentStatus(raw: RawSubagent): SubagentInfo["status"] {
  if (raw.status === "completed") return "done";
  if (raw.status === "running") return "running";
  if (FAILED_STATUSES.has(raw.status ?? "")) return "failed";
  return raw.completedAt ? "done" : "running";
}

function toSubagent(raw: RawSubagent): SubagentInfo {
  const status = subagentStatus(raw);
  const title = raw.title?.trim() || truncate(raw.prompt?.trim() ?? "", 80) || "Subagent";
  return {
    id: raw.id,
    title,
    status,
    progress: status === "running" ? (raw.progress ?? null) : null,
    result: raw.result ? truncate(raw.result, RESULT_CHARS) : null,
    startedAt: raw.startedAt ?? null,
    completedAt: raw.completedAt ?? null,
    stop: status === "running" && raw.runId ? "subagent" : null,
  };
}

// Latest run by start time (array order breaks ties); without runs, the run of the newest subagent.
function latestRunId(projection: RawProjection): string | undefined {
  const stamp = (run: { startedAt?: string | null; createdAt?: string | null }) => run.startedAt ?? run.createdAt ?? "";
  const pick = <T extends { id?: string }>(items: T[], at: (item: T) => string, id: (item: T) => string | null | undefined) =>
    items.reduce<{ id?: string | null; at: string } | undefined>((best, item) => (id(item) && (!best || at(item) >= best.at) ? { id: id(item), at: at(item) } : best), undefined)?.id ?? undefined;
  // A queued run, or one removed from the queue, never started: it must not pass for the latest run.
  const runs = (projection.runs ?? []).filter((run) => run.status !== "queued" && !(run.status === "cancelled" && !run.startedAt));
  if (runs.length) return pick(runs, stamp, (run) => run.id);
  return pick(projection.subagents ?? [], (raw) => raw.startedAt ?? "", (raw) => raw.runId);
}

// Ids identify a task; the title is a weak guess, used only when the task has no id.
const matchesTask = (raw: RawSubagent, task: RawBackgroundTask): boolean => {
  if (task.childThreadId || task.taskId) {
    return Boolean((task.childThreadId && raw.childThreadId === task.childThreadId) || (task.taskId && raw.nativeTaskRef?.nativeId === task.taskId));
  }
  return Boolean(task.description && raw.title === task.description);
};

// A long thread holds dozens of subagents: keep the latest run's, plus older ones the shell still lists
// as pending background tasks. A stale "running" subagent that no task names stays hidden.
function subagentsOf(projection: RawProjection, tasks: RawBackgroundTask[]): SubagentInfo[] {
  const latestRun = latestRunId(projection);
  const all = projection.subagents ?? [];
  const kept = all.filter(
    (raw) => latestRun === undefined || raw.runId === latestRun || (subagentStatus(raw) === "running" && tasks.some((task) => matchesTask(raw, task))),
  );
  const orphans: SubagentInfo[] = tasks
    .filter((task) => !kept.some((raw) => matchesTask(raw, task)))
    .map((task) => ({ id: `task:${task.taskId ?? task.childThreadId ?? task.description}`, title: task.description?.trim() || "Subagent", status: "running", progress: null, result: null, startedAt: null, completedAt: null, stop: "thread" }));
  return [...kept.map(toSubagent), ...orphans].sort(
    (a, b) => Number(b.status === "running") - Number(a.status === "running") || (b.startedAt ?? "").localeCompare(a.startedAt ?? ""),
  );
}

// Texts are cut so a long run never sends megabytes to the browser.
const STEP_CHARS = 300;
const MAX_STEPS = 400;
const MAX_TODOS = 50;
const MAX_PLAN_CHARS = 20_000;
const MAX_INPUT_CHARS = 20_000;
const MAX_OUTPUT_CHARS = 64_000;
const MAX_TEXT_CHARS = 64_000;
const MAX_DIFF_CHARS = 200_000;
const MAX_RESULTS = 50;

const STEP_KINDS: Record<string, StepKind> = {
  reasoning: "thinking",
  command_execution: "command",
  dynamic_tool: "tool",
  file_change: "file",
  file_search: "search",
  web_search: "web",
  todo_list: "todo",
  proposed_plan: "plan",
  subagent: "subagent",
  checkpoint: "notice",
  compaction: "notice",
  error: "notice",
  system_notice: "notice",
  run_interrupt_request: "notice",
  run_interrupt_result: "notice",
};
const NOTICES: Record<string, NonNullable<TurnStep["notice"]>> = {
  checkpoint: "checkpoint",
  compaction: "compaction",
  error: "error",
  system_notice: "system",
  run_interrupt_request: "interrupt",
  run_interrupt_result: "interrupt",
};
const SUMMARY_KEYS = ["description", "summary", "query", "url", "skill", "command", "file_path", "path", "pattern", "expression", "title", "prompt"];

function toolSummary(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const value = SUMMARY_KEYS.map((key) => record[key]).find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? truncate(value.trim(), STEP_CHARS) : null;
}

function stepStatus(item: RawTurnItem): StepStatus {
  if (FAILED_STATUSES.has(item.status ?? "") || item.outputIndicatesFailure || (item.exitCode ?? 0) !== 0) return "failed";
  if (item.status === "completed" || item.completedAt) return "done";
  return "running";
}

const count = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;

function todosOf(item: RawTurnItem): TodoEntry[] {
  return (item.steps ?? []).slice(0, MAX_TODOS).map((step) => ({
    text: truncate(step.text?.trim() ?? "", STEP_CHARS),
    status: step.status === "completed" || step.status === "running" ? step.status : "pending",
  }));
}

function noticeText(item: RawTurnItem): { text: string; detail: string | null } {
  const cut = (value: string | null | undefined) => (value?.trim() ? truncate(value.trim(), STEP_CHARS) : null);
  switch (item.type) {
    case "checkpoint": {
      const files = item.filesTotal ?? item.files?.length;
      return { text: "Checkpoint", detail: files ? count(files, "file") : null };
    }
    case "compaction": {
      const tokens = item.beforeTokenCount != null && item.afterTokenCount != null ? `${item.beforeTokenCount} → ${item.afterTokenCount} tokens` : null;
      return { text: "Context compacted", detail: cut(item.summary) ?? tokens };
    }
    case "error":
      return { text: cut(item.failure?.message) ?? "Error", detail: null };
    case "system_notice":
      return { text: cut(item.message) ?? "Notice", detail: null };
    default:
      return { text: cut(item.message) ?? "Interrupted", detail: null };
  }
}

const subagentIdOf = (item: RawTurnItem) => item.subagentId ?? item.nodeId ?? item.id!;

function toStep(item: RawTurnItem, kind: StepKind, projection: RawProjection): TurnStep {
  const base = { id: item.id!, runId: item.runId ?? null, kind, startedAt: item.startedAt ?? "", completedAt: item.completedAt ?? null, exitCode: item.exitCode ?? null, text: "", detail: null as string | null, expandable: false };
  const status = stepStatus(item);
  switch (kind) {
    case "thinking": {
      const full = item.text?.trim() || item.title || "Thinking";
      return { ...base, status, text: truncate(full, STEP_CHARS), expandable: full.length > STEP_CHARS };
    }
    case "command":
      return { ...base, status, text: truncate(typeof item.input === "string" ? item.input : "", STEP_CHARS), expandable: true };
    case "tool":
      // MCP tools are named mcp__<server>__<tool>: the last part is enough.
      return { ...base, status, text: truncate(item.title || item.toolName?.split("__").at(-1) || "Tool", STEP_CHARS), detail: toolSummary(item.input), expandable: true };
    case "file": {
      const known = item.additions != null || item.deletions != null;
      return { ...base, status, text: truncate(item.fileName ?? "", STEP_CHARS), detail: known ? `+${item.additions ?? 0} −${item.deletions ?? 0}` : null, expandable: true };
    }
    case "search":
    case "web": {
      const found = item.results?.length;
      const text = kind === "search" ? (item.pattern ?? "") : (item.patterns ?? []).join(", ");
      return { ...base, status, text: truncate(text || (kind === "search" ? "Search" : "Web search"), STEP_CHARS), detail: found === undefined ? null : count(found, "result"), expandable: Boolean(found) };
    }
    case "todo":
      return { ...base, status, text: truncate(item.explanation?.trim() || "Plan", STEP_CHARS), todos: todosOf(item) };
    case "plan":
      return { ...base, status: status === "failed" ? status : "done", text: "Proposed plan", markdown: truncate(item.markdown ?? "", MAX_PLAN_CHARS) };
    case "subagent": {
      const subagentId = subagentIdOf(item);
      const raw = (projection.subagents ?? []).find((candidate) => candidate.id === subagentId);
      const state = raw ? subagentStatus(raw) : status;
      const result = item.result?.trim() || raw?.result?.trim();
      return {
        ...base,
        status: state,
        text: truncate(item.title?.trim() || item.prompt?.trim() || "Subagent", STEP_CHARS),
        detail: state !== "running" && result ? truncate(result, RESULT_CHARS) : null,
        expandable: Boolean(result),
        subagent: { subagentId, childThreadId: item.childThreadId ?? raw?.childThreadId ?? null, progress: state === "running" ? (item.progress ?? raw?.progress ?? null) : null, stoppable: state === "running" && Boolean(raw?.runId) },
      };
    }
    case "notice":
      return { ...base, status: item.type === "error" ? "failed" : "done", ...noticeText(item), notice: NOTICES[item.type!] };
  }
}

/** The latest steps of every run, oldest first. Items from a parent thread are not this thread's steps. */
function stepsOf(threadId: string, projection: RawProjection): { steps: TurnStep[]; omitted: number } {
  const entries = [...(projection.turnItems ?? []), ...(projection.visibleTurnItems ?? [])].map(entryOf);
  const byId = new Map<string, RawTurnItem>();
  for (const { item, visibility } of entries) {
    if (!item.id || visibility === "inherited" || (item.threadId && item.threadId !== threadId) || !STEP_KINDS[item.type ?? ""]) continue;
    byId.set(item.id, item);
  }
  const steps = [...byId.values()].sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0)).map((item) => toStep(item, STEP_KINDS[item.type!]!, projection));
  return { steps: steps.slice(-MAX_STEPS), omitted: Math.max(0, steps.length - MAX_STEPS) };
}

const head = (text: string, max: number) => ({ text: text.length > max ? text.slice(0, max) : text, cut: text.length > max });
const tail = (text: string, max: number) => ({ text: text.length > max ? text.slice(-max) : text, cut: text.length > max });
const pretty = (value: unknown) => (typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? ""));

// A command answers its output as plain text, or as JSON {stdout, stderr, interrupted}.
function commandOutput(output: unknown): string | null {
  if (output == null) return null;
  let value = output;
  if (typeof output === "string" && output.startsWith("{")) {
    try {
      value = JSON.parse(output);
    } catch {
      return output;
    }
  }
  if (typeof value === "object" && value !== null && ("stdout" in value || "stderr" in value)) {
    const { stdout, stderr } = value as { stdout?: unknown; stderr?: unknown };
    return [stdout, stderr].filter((part): part is string => typeof part === "string" && part !== "").join("\n");
  }
  return pretty(value);
}

// An MCP tool answers [{type: "text", text}] or {content: [...]}: show the text, not the envelope.
function toolOutput(output: unknown): string | null {
  if (output == null) return null;
  const parts = Array.isArray(output) ? output : (output as { content?: unknown }).content;
  if (Array.isArray(parts)) {
    const texts = parts.flatMap((part) => (part?.type === "text" && typeof part.text === "string" ? [part.text] : []));
    if (texts.length) return texts.join("\n");
  }
  return pretty(output);
}

const lines = (text: string) => (text === "" ? [] : text.split("\n"));

// T3 sends a diff string when it has one; otherwise rebuild a simple one from the old and new texts.
function diffOf(item: RawTurnItem): string | null {
  if (item.diffStr) return item.diffStr;
  if (item.oldStr == null && item.newStr == null) return null;
  const before = lines(item.oldStr ?? "");
  const after = lines(item.newStr ?? "");
  const name = item.fileName ?? "file";
  return [`--- ${item.oldStr == null ? "/dev/null" : `a/${name}`}`, `+++ b/${name}`, `@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@`, ...before.map((line) => `-${line}`), ...after.map((line) => `+${line}`)].join("\n");
}

/** The full item behind a TurnStep, with every text capped. A subagent without a result takes the projection's. */
export function toStepDetail(item: RawTurnItem, projection?: RawProjection): StepDetail {
  const kind = STEP_KINDS[item.type ?? ""] ?? "tool";
  let truncated = false;
  const cap = (value: string | null, max: number, pick: typeof head) => {
    if (value === null) return null;
    const { text, cut } = pick(value, max);
    truncated ||= cut;
    return text;
  };
  const input = kind === "command" ? (typeof item.input === "string" ? item.input : null) : kind === "tool" && item.input != null ? pretty(item.input) : null;
  const output = kind === "command" ? commandOutput(item.output) : kind === "tool" ? toolOutput(item.output) : null;
  const projected = kind === "subagent" && !item.result?.trim() ? projection?.subagents?.find((candidate) => candidate.id === subagentIdOf(item))?.result : undefined;
  const full = { thinking: item.text, subagent: item.result?.trim() ? item.result : projected, plan: item.markdown }[kind as "thinking" | "subagent" | "plan"];
  const results = (item.results ?? []).slice(0, MAX_RESULTS).map((result) => ({ title: result.title ?? result.fileName ?? result.url ?? "", url: result.url ?? null, snippet: result.snippet ?? result.preview ?? null }));
  truncated ||= (item.results?.length ?? 0) > MAX_RESULTS;
  return {
    id: item.id ?? "",
    kind,
    input: cap(input, MAX_INPUT_CHARS, head),
    output: cap(output, MAX_OUTPUT_CHARS, tail),
    exitCode: item.exitCode ?? null,
    diff: kind === "file" ? cap(diffOf(item), MAX_DIFF_CHARS, head) : null,
    text: cap(full ?? null, MAX_TEXT_CHARS, head),
    results,
    truncated,
  };
}

function activityOf(projection: RawProjection): RunActivity | null {
  const runId = projection.thread?.activeRunId ?? latestRunId(projection);
  const run = projection.runs?.find((candidate) => candidate.id === runId);
  if (!run) return null;
  return { runId: run.id, startedAt: run.startedAt ?? null, completedAt: run.completedAt ?? null };
}

const MAX_RENDER_HEIGHT = 4000;

// html_render returns {htmlRender: {attachmentId, title, height}} as its tool output.
function renderOf(item: RawTurnItem): HtmlRender | null {
  const output = item.output as { htmlRender?: { attachmentId?: unknown; title?: unknown; height?: unknown } } | null | undefined;
  const render = output?.htmlRender;
  if (!item.id || typeof render?.attachmentId !== "string") return null;
  const height = typeof render.height === "number" && render.height > 0 ? Math.min(render.height, MAX_RENDER_HEIGHT) : 400;
  return { id: item.id, attachmentId: render.attachmentId, title: typeof render.title === "string" ? render.title : "", height, createdAt: item.completedAt ?? item.startedAt ?? "" };
}

function rendersOf(items: RawTurnItem[]): HtmlRender[] {
  const byId = new Map(items.map(renderOf).filter((render) => render !== null).map((render) => [render.id, render]));
  return [...byId.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

const toAttachments = (message: RawMessage): ChatAttachment[] =>
  (message.attachments ?? []).flatMap((file) => (file.type === "image" || file.type === "file" ? [{ id: file.id, name: file.name ?? file.type, kind: file.type, mimeType: file.mimeType ?? null, sizeBytes: file.sizeBytes ?? null }] : []));

// T3's own order: queuePosition (else ordinal), then ordinal. Like T3, skip the runs it queues for a delegated
// completion or a notification: they are not the user's messages.
function queuedRunsOf(projection: RawProjection) {
  const rank = (run: { queuePosition?: number | null; ordinal?: number }) => run.queuePosition ?? run.ordinal ?? 0;
  const system = new Set((projection.messages ?? []).filter((message) => message.delegatedCompletion || message.notification).map((message) => message.id));
  return (projection.runs ?? []).filter((run) => run.status === "queued" && !system.has(run.userMessageId ?? "")).sort((a, b) => rank(a) - rank(b) || (a.ordinal ?? 0) - (b.ordinal ?? 0));
}

export interface RewindPoint {
  scopeId: string;
  checkpointId: string;
}

// Like T3 Code: "before this message" is the checkpoint of the run before it, or the start checkpoint for the first run.
export function rewindPoints(projection: RawProjection): Map<string, RewindPoint> {
  const ready = (projection.checkpoints ?? []).filter((checkpoint) => checkpoint.status === "ready");
  const runs = (projection.runs ?? []).filter((run) => run.status !== "queued" && !(run.status === "cancelled" && !run.startedAt)).sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0));
  const points = new Map<string, RewindPoint>();
  runs.forEach((run, index) => {
    if (!run.userMessageId || RUNNING_RUN_STATUSES.has(run.status ?? "")) return;
    const previous = runs[index - 1];
    const found = previous ? ready.find((checkpoint) => checkpoint.runId === previous.id) : ready.find((checkpoint) => checkpoint.ordinalWithinScope === 0 && !checkpoint.runId);
    if (found) points.set(run.userMessageId, { scopeId: found.scopeId, checkpointId: found.id });
  });
  return points;
}

/** `tasks` are the shell thread's pending background tasks: they say which subagents still run. */
export function toThreadDetail(threadId: string, projection: RawProjection, thread: DashboardThread | undefined, tasks: RawBackgroundTask[] = []): ThreadDetail {
  // Like T3 Code: a message keeps its visible item's place and time. A queued message was sent when its item
  // started, not when it was queued, so it shows after the replies written while it waited.
  const visible = new Map<string | undefined, { index: number; at: string | undefined }>();
  (projection.visibleTurnItems ?? []).map(unwrap).forEach((item, index) => {
    if (!visible.has(item.messageId)) visible.set(item.messageId, { index, at: item.startedAt ?? undefined });
  });
  const items = [...(projection.turnItems ?? []), ...(projection.visibleTurnItems ?? [])].map(unwrap);
  const queuedRuns = queuedRunsOf(projection);
  const rewind = rewindPoints(projection);
  // A queued message shows in the queue, not the conversation. Like T3 Code, a removed one stays hidden.
  const cancelled = new Set((projection.runs ?? []).filter((run) => run.status === "cancelled").map((run) => run.id));
  const hidden = new Set<string | null | undefined>([
    ...queuedRuns.map((run) => run.userMessageId),
    ...items.filter((item) => item.type === "user_message" && item.inputIntent === "queued_turn" && item.runId && cancelled.has(item.runId)).map((item) => item.messageId),
  ]);
  const messages: ChatMessage[] = (projection.messages ?? [])
    .filter((message) => visible.has(message.id) && !hidden.has(message.id))
    .sort((a, b) => visible.get(a.id)!.index - visible.get(b.id)!.index)
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text ?? "",
      createdAt: visible.get(message.id)!.at ?? message.createdAt ?? "",
      streaming: message.streaming ?? false,
      attachments: toAttachments(message),
      rewindable: message.role === "user" && rewind.has(message.id),
    }));
  const queue = queuedRuns.flatMap((run): QueuedMessage[] => {
    const message = (projection.messages ?? []).find((candidate) => candidate.id === run.userMessageId);
    if (!run.userMessageId || !message) return [];
    return [{ runId: run.id, messageId: message.id, text: message.context?.guest?.text ?? message.text ?? "Queued message", attachments: toAttachments(message), createdAt: message.createdAt ?? run.requestedAt ?? run.createdAt ?? "", editable: !message.context?.guest }];
  });
  const pendingRequests = (projection.runtimeRequests ?? []).filter((request) => request.status === "pending").map((request) => pendingDetail(request, items));
  const runtimeMode = projection.thread?.runtimeMode;
  const { steps, omitted } = stepsOf(threadId, projection);
  const own = projection.thread;
  return {
    threadId,
    title: own?.title?.trim() || null,
    subagentThread: own !== undefined && isSubagentThread(own) && !own.archivedAt && !own.deletedAt,
    thread: thread ?? null,
    messages,
    queue,
    queueHeld: queuedRuns.some((run) => run.queueHeld === true),
    renders: rendersOf(items),
    pendingRequests,
    subagents: subagentsOf(projection, tasks),
    modelSelection: projection.thread?.modelSelection ?? null,
    runtimeMode: isRuntimeMode(runtimeMode) ? runtimeMode : null,
    activity: activityOf(projection),
    steps,
    stepsOmitted: omitted,
  };
}
