import type { UpdateStatus } from "../../shared/api.ts";

const POLL_MS = 1000;
const TIMEOUT_MS = 90_000;

export interface RestartProbe {
  /** Version the running dashboard reports, or null while it does not answer. */
  health(): Promise<string | null>;
  status(): Promise<UpdateStatus | null>;
  sleep(ms: number): Promise<void>;
  now(): number;
}

export type RestartOutcome = { kind: "restarted" } | { kind: "failed"; message: string };

/** Waits until the dashboard runs another version than `from`, or the update reports an error. */
export async function waitForRestart(from: string, probe: RestartProbe): Promise<RestartOutcome> {
  const deadline = probe.now() + TIMEOUT_MS;
  while (probe.now() < deadline) {
    await probe.sleep(POLL_MS);
    const version = await probe.health();
    if (version !== null && version !== from) return { kind: "restarted" };
    const status = await probe.status();
    if (status && !status.updating && status.error) return { kind: "failed", message: status.error };
  }
  return { kind: "failed", message: "The dashboard did not restart in time. Restart it by hand to finish the update." };
}

export const updateLabel = (status: UpdateStatus): string => `Update v${status.latest}`;
export const updateQuestion = (status: UpdateStatus): string => `Update to v${status.latest}?`;

/** What Settings says after a manual check. */
export function versionNote(status: UpdateStatus): string {
  if (status.current === "dev") return "Development build. Updates come from releases.";
  if (status.available) return `Version ${status.latest} is available.`;
  return status.latest ? "Up to date" : "No release found yet.";
}
