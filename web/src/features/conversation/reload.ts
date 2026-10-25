// Run activity (commands, thinking) has no shell event per step: poll fast while a run is active.
export const RUN_POLL_MS = 2500;
// Subagent progress does not always reach the shell stream: poll while one runs.
export const SUBAGENT_POLL_MS = 4000;
// After a send the thread may not be marked running yet: poll fast for a short window anyway.
export const SEND_POLL_WINDOW_MS = 15_000;
// A live update of the thread reloads it after this delay, so a burst gives one load.
export const LIVE_RELOAD_MS = 500;

interface PollInput {
  running: boolean;
  /** When the last message was sent, in ms; 0 when none was. */
  sentAt: number;
  /** Background tasks or a running subagent. */
  background: boolean;
  now: number;
}

// A bare thread wait has nothing to show, so it is not polled.
export function pollDelay({ running, sentAt, background, now }: PollInput): number | null {
  if (running || now - sentAt < SEND_POLL_WINDOW_MS) return RUN_POLL_MS;
  return background ? SUBAGENT_POLL_MS : null;
}
