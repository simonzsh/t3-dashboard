import type { StepKind, TurnStep } from "../../../../shared/api.ts";
import { duration } from "../../lib/format.ts";
import type { IconName } from "../../ui/index.ts";

export const STEP_ICONS: Record<StepKind, IconName> = {
  thinking: "thinking",
  command: "terminal",
  tool: "wrench",
  file: "edit",
  search: "search",
  web: "globe",
  todo: "listChecks",
  plan: "fileText",
  subagent: "bot",
  notice: "info",
  secret: "lock",
};

/** The time from the first start to the last end, or null while a step has no time. */
export function groupSpanMs(steps: TurnStep[]): number | null {
  const start = steps[0]?.startedAt;
  const end = steps.reduce((latest, s) => (s.completedAt && s.completedAt > latest ? s.completedAt : latest), "");
  return start && end ? Math.max(0, Date.parse(end) - Date.parse(start)) : null;
}

export function groupLabel(steps: TurnStep[]): string {
  const count = `${steps.length} ${steps.length === 1 ? "step" : "steps"}`;
  const span = groupSpanMs(steps);
  return span === null ? count : `${count} · ${duration(span)}`;
}

export interface DiffLine {
  type: "add" | "del" | "hunk" | "ctx";
  text: string;
}

// Before the first hunk, "---" and "+++" are file headers; after it they are content.
export function diffLines(diff: string): DiffLine[] {
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let inHunk = false;
  return lines.map((text): DiffLine => {
    if (text.startsWith("diff --git")) {
      inHunk = false;
      return { type: "hunk", text };
    }
    if (text.startsWith("@@")) {
      inHunk = true;
      return { type: "hunk", text };
    }
    if (!inHunk) return { type: "hunk", text };
    if (text.startsWith("+")) return { type: "add", text };
    if (text.startsWith("-")) return { type: "del", text };
    return { type: "ctx", text };
  });
}

/** Stores a value in a Map used as an LRU cache: the oldest entry leaves once `max` is passed. */
export function remember<V>(cache: Map<string, V>, key: string, value: V, max: number): void {
  cache.delete(key);
  cache.set(key, value);
  if (cache.size > max) cache.delete(cache.keys().next().value!);
}

export const omittedLabel = (count: number): string => `${count} earlier ${count === 1 ? "step" : "steps"} not shown`;
