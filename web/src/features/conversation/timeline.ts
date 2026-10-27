import type { ChatMessage, HtmlRender, RunChanges, ThreadDetail } from "../../../../shared/api.ts";

export type Entry =
  | { kind: "message"; at: string; message: ChatMessage }
  | { kind: "render"; at: string; render: HtmlRender }
  | { kind: "changes"; at: string; run: RunChanges };

// Pages sit between messages by time; a stable sort keeps the message order T3 gave.
// A run's changes follow its last message; without one, they sit where the run ended.
export function timeline(detail: Pick<ThreadDetail, "messages" | "renders" | "runChanges">): Entry[] {
  const entries: Entry[] = [
    ...detail.messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...detail.renders.map((render) => ({ kind: "render" as const, at: render.createdAt, render })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  for (const run of detail.runChanges) {
    const entry: Entry = { kind: "changes", at: run.completedAt, run };
    const last = entries.findLastIndex((other) => other.kind === "message" && other.message.runId === run.runId);
    const index = last !== -1 ? last + 1 : entries.findIndex((other) => other.at > run.completedAt);
    entries.splice(index === -1 ? entries.length : index, 0, entry);
  }
  return entries;
}
