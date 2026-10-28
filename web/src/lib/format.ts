export function relativeTime(iso: string, now: Date): string {
  const min = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${Math.floor(min)} min ago`;
  if (min < 1440) return `${Math.floor(min / 60)} h ago`;
  return `${Math.floor(min / 1440)} d ago`;
}

// One formatter for all messages: building one per render is slow.
const MESSAGE_TIME = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });
export const formatMessageTime = (iso: string): string => MESSAGE_TIME.format(new Date(iso));

export function duration(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, "0");
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${pad(Math.floor(s / 60) % 60)}m`;
}

const NETWORK_FAILURE = /failed to fetch|networkerror|load failed|network request failed/i;

// Turns what fetch and the server throw into a sentence a person can act on.
export function errorMessage(error: unknown): string {
  if (error instanceof DOMException && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "The request took too long. Try again in a moment.";
  }
  if (error instanceof TypeError && NETWORK_FAILURE.test(error.message)) {
    return "Cannot reach the dashboard server. Check that it is running, then try again.";
  }
  const text = (error instanceof Error ? error.message : String(error)).trim();
  return text || "Something went wrong. Try again.";
}

/** "Could not send the message. <reason>": says what failed, then why. */
export const failure = (what: string, error: unknown): string => `Could not ${what}. ${errorMessage(error)}`;

/** Status of a run step or a subagent. */
export const STEP_LABELS: Record<"running" | "done" | "failed", string> = { running: "Running", done: "Done", failed: "Failed" };
