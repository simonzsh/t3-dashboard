import type { ChatMessage, DashboardThread, PendingRequestDetail, SubagentInfo, ThreadDetail } from "../shared/api.ts";
import { isRuntimeMode } from "./t3/commands.ts";
import type { RawProjection, RawRuntimeRequest, RawSubagent, RawTurnItem } from "./t3/types.ts";

// Turn items arrive wrapped as `{item}` in some payloads and bare in others.
const unwrap = (element: { item?: RawTurnItem } | RawTurnItem): RawTurnItem => ("item" in element && element.item ? element.item : (element as RawTurnItem));

function pendingDetail(request: RawRuntimeRequest, items: RawTurnItem[]): PendingRequestDetail {
  const base = { requestId: request.id, resumable: request.responseCapability?.type !== "not_resumable", createdAt: request.createdAt ?? "" };
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
    return { category: "user-input", ...base, questions };
  }
  return { category: "other", ...base, requestKind: request.kind ?? "" };
}

const RESULT_CHARS = 200;
const FAILED = new Set(["failed", "interrupted", "cancelled", "canceled", "error", "errored"]);

const truncate = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function subagentStatus(raw: RawSubagent): SubagentInfo["status"] {
  if (raw.status === "completed") return "done";
  if (raw.status === "running") return "running";
  if (FAILED.has(raw.status ?? "")) return "failed";
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
  };
}

// Latest run by start time (array order breaks ties); without runs, the run of the newest subagent.
function latestRunId(projection: RawProjection): string | undefined {
  const stamp = (run: { startedAt?: string | null; createdAt?: string | null }) => run.startedAt ?? run.createdAt ?? "";
  const pick = <T extends { id?: string }>(items: T[], at: (item: T) => string, id: (item: T) => string | null | undefined) =>
    items.reduce<{ id?: string | null; at: string } | undefined>((best, item) => (id(item) && (!best || at(item) >= best.at) ? { id: id(item), at: at(item) } : best), undefined)?.id ?? undefined;
  const runs = projection.runs ?? [];
  if (runs.length) return pick(runs, stamp, (run) => run.id);
  return pick(projection.subagents ?? [], (raw) => raw.startedAt ?? "", (raw) => raw.runId);
}

// A long thread holds dozens of subagents: keep only the latest run's (a stale "running" one must not stay).
function subagentsOf(projection: RawProjection): SubagentInfo[] {
  const latestRun = latestRunId(projection);
  return (projection.subagents ?? [])
    .filter((raw) => latestRun === undefined || raw.runId === latestRun)
    .map(toSubagent)
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

export function toThreadDetail(threadId: string, projection: RawProjection, thread: DashboardThread | undefined): ThreadDetail {
  const visible = new Set((projection.visibleTurnItems ?? []).map((element) => unwrap(element).messageId));
  const messages: ChatMessage[] = (projection.messages ?? [])
    .filter((message) => visible.has(message.id))
    .map((message) => ({ id: message.id, role: message.role, text: message.text ?? "", createdAt: message.createdAt ?? "", streaming: message.streaming ?? false }));
  const items = [...(projection.turnItems ?? []), ...(projection.visibleTurnItems ?? [])].map(unwrap);
  const pendingRequests = (projection.runtimeRequests ?? []).filter((request) => request.status === "pending").map((request) => pendingDetail(request, items));
  const runtimeMode = projection.thread?.runtimeMode;
  return {
    threadId,
    thread: thread ?? null,
    messages,
    pendingRequests,
    subagents: subagentsOf(projection),
    modelSelection: projection.thread?.modelSelection ?? null,
    runtimeMode: isRuntimeMode(runtimeMode) ? runtimeMode : null,
  };
}
