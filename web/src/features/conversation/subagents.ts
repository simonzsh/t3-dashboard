import type { SubagentState, TurnStep } from "../../../../shared/api.ts";

/** Labels of T3 Code's subagent statuses. */
export const SUBAGENT_LABELS: Record<SubagentState, string> = {
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  idle: "Idle · resumable",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

export const MAX_AVATARS = 3;

export type SubagentTone = "active" | "ok" | "danger" | "muted";

const ACTIVE: ReadonlySet<SubagentState> = new Set(["queued", "running", "waiting"]);
const TONES: Record<SubagentState, SubagentTone> = { queued: "active", running: "active", waiting: "active", idle: "muted", completed: "ok", failed: "danger", stopped: "muted" };

const stateOf = (step: TurnStep): SubagentState => step.subagent?.state ?? "running";
export const isActive = (step: TurnStep): boolean => ACTIVE.has(stateOf(step));
export const subagentTone = (step: TurnStep): SubagentTone => TONES[stateOf(step)];

/** Consecutive subagents of one run and one provider turn start together: they share a row group. */
export function sameGroup(a: TurnStep, b: TurnStep): boolean {
  return a.runId === b.runId && (a.subagent?.turnId ?? null) === (b.subagent?.turnId ?? null);
}

const COUNTED: [label: string, states: SubagentState[]][] = [
  ["working", ["queued", "running", "waiting"]],
  ["done", ["completed"]],
  ["failed", ["failed"]],
  ["stopped", ["stopped"]],
  ["idle", ["idle"]],
];

/** "2 working", "1 working · 1 done". Blue while one works, else red when one failed. */
export function groupStatus(steps: TurnStep[]): { text: string; tone: SubagentTone } {
  const states = steps.map(stateOf);
  const parts = COUNTED.flatMap(([label, of]) => {
    const n = states.filter((s) => of.includes(s)).length;
    return n > 0 ? [`${n} ${label}`] : [];
  });
  const tone = states.some((s) => ACTIVE.has(s)) ? "active" : states.includes("failed") ? "danger" : "muted";
  return { text: parts.join(" · "), tone };
}

/** First start to last end; to `now` while one still runs. Null without a start. */
export function groupElapsedMs(steps: TurnStep[], now: number): number | null {
  const starts = steps.map((s) => s.startedAt).filter(Boolean);
  if (starts.length === 0) return null;
  const start = Date.parse(starts.reduce((a, b) => (a < b ? a : b)));
  const ends = steps.map((s) => s.completedAt).filter((c): c is string => Boolean(c));
  const end = steps.some(isActive) || ends.length === 0 ? now : Date.parse(ends.reduce((a, b) => (a > b ? a : b)));
  return Math.max(0, end - start);
}

// Plain text for one grey line: no markdown marks, no T3 status boilerplate.
function plain(text: string): string {
  return text
    .replace(/Child task ended with status[^\n]*/gi, "")
    .replace(/```[a-z]*/gi, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|[-*+>]|\d+\.)\s+/gm, "")
    .replace(/[*_`~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The grey line of a row: the latest progress while it runs, else its result; the status label as a last resort. */
export function subagentLine(step: TurnStep): string | null {
  const sub = step.subagent;
  if (!sub) return null;
  return plain(sub.progress ?? step.detail ?? "") || null;
}
