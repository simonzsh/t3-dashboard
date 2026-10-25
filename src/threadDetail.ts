import type { ChatMessage, DashboardThread, PendingRequestDetail, SubagentInfo, ThreadDetail } from "../shared/api.ts";
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

// A long thread holds dozens of subagents: keep the latest run's and those still running.
function subagentsOf(projection: RawProjection): SubagentInfo[] {
  const latestRun = projection.runs?.at(-1)?.id;
  return (projection.subagents ?? [])
    .map((raw) => ({ raw, info: toSubagent(raw) }))
    .filter(({ raw, info }) => latestRun === undefined || raw.runId === latestRun || info.status === "running")
    .map(({ info }) => info)
    .sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || (b.startedAt ?? "").localeCompare(a.startedAt ?? ""));
}

export function toThreadDetail(threadId: string, projection: RawProjection, thread: DashboardThread | undefined): ThreadDetail {
  const visible = new Set((projection.visibleTurnItems ?? []).map((element) => unwrap(element).messageId));
  const messages: ChatMessage[] = (projection.messages ?? [])
    .filter((message) => visible.has(message.id))
    .map((message) => ({ id: message.id, role: message.role, text: message.text ?? "", createdAt: message.createdAt ?? "", streaming: message.streaming ?? false }));
  const items = [...(projection.turnItems ?? []), ...(projection.visibleTurnItems ?? [])].map(unwrap);
  const pendingRequests = (projection.runtimeRequests ?? []).filter((request) => request.status === "pending").map((request) => pendingDetail(request, items));
  return { threadId, thread: thread ?? null, messages, pendingRequests, subagents: subagentsOf(projection) };
}
