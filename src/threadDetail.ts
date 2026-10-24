import type { ChatMessage, DashboardThread, PendingRequestDetail, ThreadDetail } from "../shared/api.ts";
import type { RawProjection, RawRuntimeRequest, RawTurnItem } from "./t3/types.ts";

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

export function toThreadDetail(threadId: string, projection: RawProjection, thread: DashboardThread | undefined): ThreadDetail {
  const visible = new Set((projection.visibleTurnItems ?? []).map((element) => unwrap(element).messageId));
  const messages: ChatMessage[] = (projection.messages ?? [])
    .filter((message) => visible.has(message.id))
    .map((message) => ({ id: message.id, role: message.role, text: message.text ?? "", createdAt: message.createdAt ?? "", streaming: message.streaming ?? false }));
  const items = [...(projection.turnItems ?? []), ...(projection.visibleTurnItems ?? [])].map(unwrap);
  const pendingRequests = (projection.runtimeRequests ?? []).filter((request) => request.status === "pending").map((request) => pendingDetail(request, items));
  return { threadId, thread: thread ?? null, messages, pendingRequests };
}
