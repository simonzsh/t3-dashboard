import type { ChatMessage, HtmlRender, ThreadDetail } from "../../../../shared/api.ts";

export type Entry = { kind: "message"; at: string; message: ChatMessage } | { kind: "render"; at: string; render: HtmlRender };

// Pages sit between messages by time; a stable sort keeps the message order T3 gave.
export function timeline(detail: Pick<ThreadDetail, "messages" | "renders">): Entry[] {
  const entries: Entry[] = [
    ...detail.messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...detail.renders.map((render) => ({ kind: "render" as const, at: render.createdAt, render })),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
