import type { ChatMessage, HtmlRender, ThreadDetail, TurnStep, StepKind } from "../../../../shared/api.ts";

export type Entry =
  | { kind: "message"; at: string; message: ChatMessage }
  | { kind: "render"; at: string; render: HtmlRender }
  | { kind: "work"; at: string; steps: TurnStep[] }
  | { kind: "step"; at: string; step: TurnStep };

// These steps fold into a work group; the others (plan, todo, subagent, notice) deserve their own block.
const GROUPED: ReadonlySet<StepKind> = new Set(["thinking", "command", "tool", "file", "search", "web"]);

// Pages and steps sit between messages by time; a stable sort keeps the order T3 gave.
// A step with no time takes the time of the step before it.
export function timeline(detail: Pick<ThreadDetail, "messages" | "renders" | "steps">): Entry[] {
  let last = "";
  const entries: Entry[] = [
    ...detail.messages.map((message) => ({ kind: "message" as const, at: message.createdAt, message })),
    ...detail.renders.map((render) => ({ kind: "render" as const, at: render.createdAt, render })),
    ...detail.steps.map((step) => ({ kind: "step" as const, at: (last = step.startedAt || last), step })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const out: Entry[] = [];
  for (const entry of entries) {
    if (entry.kind !== "step" || !GROUPED.has(entry.step.kind)) {
      out.push(entry);
      continue;
    }
    const previous = out.at(-1);
    if (previous?.kind === "work") previous.steps.push(entry.step);
    else out.push({ kind: "work", at: entry.at, steps: [entry.step] });
  }
  return out;
}
