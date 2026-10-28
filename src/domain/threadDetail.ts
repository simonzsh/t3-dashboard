import type { ActivityItem, ChatAttachment, ChatMessage, DashboardThread, HtmlRender, RunActivity, PendingRequestDetail, QueuedMessage, SubagentInfo, ThreadDetail } from "../../shared/api.ts";
import { FAILED_STATUSES } from "../../shared/status.ts";
import { isRuntimeMode } from "../../shared/limits.ts";
import type { RawBackgroundTask, RawMessage, RawProjection, RawRuntimeRequest, RawSubagent, RawTurnItem } from "../integrations/t3/schemas.ts";

// Turn items arrive wrapped as `{item}` in some payloads and bare in others.
const unwrap = (element: { item?: RawTurnItem } | RawTurnItem): RawTurnItem => ("item" in element && element.item ? element.item : (element as RawTurnItem));

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
const ACTIVITY_CHARS = 300;
const ACTIVITY_ITEMS = 200;
const ACTIVITY_KINDS: Record<string, ActivityItem["kind"]> = {
  reasoning: "thinking",
  command_execution: "command",
  dynamic_tool: "tool",
  file_change: "file",
  subagent: "subagent",
};
const SUMMARY_KEYS = ["description", "summary", "query", "url", "skill", "command", "file_path", "path", "pattern", "expression", "title", "prompt"];

function toolSummary(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const value = SUMMARY_KEYS.map((key) => record[key]).find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? truncate(value.trim(), ACTIVITY_CHARS) : null;
}

function activityStatus(item: RawTurnItem): ActivityItem["status"] {
  if (FAILED_STATUSES.has(item.status ?? "") || item.outputIndicatesFailure || (item.exitCode ?? 0) !== 0) return "failed";
  if (item.status === "completed" || item.completedAt) return "done";
  return "running";
}

function toActivity(item: RawTurnItem, kind: ActivityItem["kind"]): ActivityItem {
  const raw = {
    thinking: () => item.text?.trim() || item.title || "Thinking",
    command: () => (typeof item.input === "string" ? item.input : ""),
    // MCP tools are named mcp__<server>__<tool>: the last part is enough.
    tool: () => item.title || item.toolName?.split("__").at(-1) || "Tool",
    file: () => item.fileName ?? "",
    subagent: () => item.title?.trim() || item.prompt?.trim() || "Subagent",
  }[kind]();
  return { id: item.id!, kind, text: truncate(raw, ACTIVITY_CHARS), detail: kind === "tool" ? toolSummary(item.input) : null, status: activityStatus(item) };
}

function activityOf(projection: RawProjection, items: RawTurnItem[]): RunActivity | null {
  const runId = projection.thread?.activeRunId ?? latestRunId(projection);
  const run = projection.runs?.find((candidate) => candidate.id === runId);
  if (!run) return null;
  // turnItems and visibleTurnItems repeat the same items: keep one per id.
  const ofRun = new Map(items.filter((item) => item.id && item.runId === run.id && ACTIVITY_KINDS[item.type ?? ""]).map((item) => [item.id, item]));
  const activity = [...ofRun.values()]
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    .slice(-ACTIVITY_ITEMS)
    .map((item) => toActivity(item, ACTIVITY_KINDS[item.type!]!));
  return { runId: run.id, startedAt: run.startedAt ?? null, completedAt: run.completedAt ?? null, items: activity };
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

const toAttachments = (message: RawMessage): ChatAttachment[] => (message.attachments ?? []).filter((file) => file.type === "image").map((file) => ({ id: file.id, name: file.name ?? "image" }));

// T3's own order: queuePosition (else ordinal), then ordinal. Like T3, skip the runs it queues for a delegated
// completion or a notification: they are not the user's messages.
function queuedRunsOf(projection: RawProjection) {
  const rank = (run: { queuePosition?: number | null; ordinal?: number }) => run.queuePosition ?? run.ordinal ?? 0;
  const system = new Set((projection.messages ?? []).filter((message) => message.delegatedCompletion || message.notification).map((message) => message.id));
  return (projection.runs ?? []).filter((run) => run.status === "queued" && !system.has(run.userMessageId ?? "")).sort((a, b) => rank(a) - rank(b) || (a.ordinal ?? 0) - (b.ordinal ?? 0));
}

/** `tasks` are the shell thread's pending background tasks: they say which subagents still run. */
export function toThreadDetail(threadId: string, projection: RawProjection, thread: DashboardThread | undefined, tasks: RawBackgroundTask[] = []): ThreadDetail {
  const visible = new Set((projection.visibleTurnItems ?? []).map((element) => unwrap(element).messageId));
  const items = [...(projection.turnItems ?? []), ...(projection.visibleTurnItems ?? [])].map(unwrap);
  const queuedRuns = queuedRunsOf(projection);
  // A queued message shows in the queue, not the conversation. Like T3 Code, a removed one stays hidden.
  const cancelled = new Set((projection.runs ?? []).filter((run) => run.status === "cancelled").map((run) => run.id));
  const hidden = new Set<string | null | undefined>([
    ...queuedRuns.map((run) => run.userMessageId),
    ...items.filter((item) => item.type === "user_message" && item.inputIntent === "queued_turn" && item.runId && cancelled.has(item.runId)).map((item) => item.messageId),
  ]);
  const messages: ChatMessage[] = (projection.messages ?? [])
    .filter((message) => visible.has(message.id) && !hidden.has(message.id))
    .map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text ?? "",
      createdAt: message.createdAt ?? "",
      streaming: message.streaming ?? false,
      attachments: toAttachments(message),
    }));
  const queue = queuedRuns.flatMap((run): QueuedMessage[] => {
    const message = (projection.messages ?? []).find((candidate) => candidate.id === run.userMessageId);
    if (!run.userMessageId || !message) return [];
    return [{ runId: run.id, messageId: message.id, text: message.context?.guest?.text ?? message.text ?? "Queued message", attachments: toAttachments(message), createdAt: message.createdAt ?? run.requestedAt ?? run.createdAt ?? "", editable: !message.context?.guest }];
  });
  const pendingRequests = (projection.runtimeRequests ?? []).filter((request) => request.status === "pending").map((request) => pendingDetail(request, items));
  const runtimeMode = projection.thread?.runtimeMode;
  return {
    threadId,
    thread: thread ?? null,
    messages,
    queue,
    queueHeld: queuedRuns.some((run) => run.queueHeld === true),
    renders: rendersOf(items),
    pendingRequests,
    subagents: subagentsOf(projection, tasks),
    modelSelection: projection.thread?.modelSelection ?? null,
    runtimeMode: isRuntimeMode(runtimeMode) ? runtimeMode : null,
    activity: activityOf(projection, items),
  };
}
