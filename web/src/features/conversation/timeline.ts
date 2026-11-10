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
    // Checkpoints support rewind but add no conversation content.
    if (entry.kind === "step" && entry.step.notice === "checkpoint") continue;
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

export function timelineKey(entry: Entry): string {
  switch (entry.kind) {
    case "message": return `message:${entry.message.id}`;
    case "render": return `render:${entry.render.id}`;
    case "step": return `step:${entry.step.id}`;
    default: return `${entry.kind}:${entry.steps[0]!.id}`;
  }
}

/** Keep a stable first row while reading; searching can reveal older rows. */
export function historyStart(entries: Entry[], first: string | null, following: boolean, searchMessageId: string | null, batch: number): number {
  const recent = Math.max(0, entries.length - batch);
  const previous = first === null ? -1 : entries.findIndex(entry => timelineKey(entry) === first);
  const start = following || previous < 0 ? recent : previous;
  const match = searchMessageId === null ? -1 : entries.findIndex(entry => entry.kind === "message" && entry.message.id === searchMessageId);
  return match < 0 ? start : Math.min(start, match);
}
