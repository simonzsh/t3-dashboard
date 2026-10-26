export function relativeTime(iso: string, now: Date): string {
  const min = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / 1440)} d ago`;
}

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${pad(Math.floor(s / 60) % 60)}m`;
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** Status of a run step or a subagent. */
export const STEP_LABELS: Record<"running" | "done" | "failed", string> = { running: "Running", done: "Done", failed: "Failed" };
