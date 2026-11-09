import { sameGroup } from "./subagents.ts";
import type { ChatMessage, HtmlRender, ThreadDetail, TurnStep, StepKind } from "../../../../shared/api.ts";

export type Entry =
  | { kind: "message"; at: string; message: ChatMessage }
  | { kind: "render"; at: string; render: HtmlRender }
  | { kind: "work"; at: string; steps: TurnStep[] }
  | { kind: "subagents"; at: string; steps: TurnStep[] }
  | { kind: "step"; at: string; step: TurnStep };

// These steps fold into a work group; the others (plan, todo, notice) deserve their own block.
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
    const previous = out.at(-1);
    if (entry.kind === "step" && entry.step.kind === "subagent") {
      if (previous?.kind === "subagents" && sameGroup(previous.steps[0]!, entry.step)) previous.steps.push(entry.step);
      else out.push({ kind: "subagents", at: entry.at, steps: [entry.step] });
      continue;
    }
    if (entry.kind !== "step" || !GROUPED.has(entry.step.kind)) {
      out.push(entry);
      continue;
    }
    if (previous?.kind === "work") previous.steps.push(entry.step);
    else out.push({ kind: "work", at: entry.at, steps: [entry.step] });
  }
  return out;
}

// A trailing work group owns the live indicator. All other entries need a fallback.
export function awaitingStep(entries: Entry[], running: boolean): boolean {
  return running && entries.at(-1)?.kind !== "work";
}
