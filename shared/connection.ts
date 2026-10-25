// The link to T3 Code and the setup screen.

export type SetupReason = "t3-missing" | "t3-stopped" | "token-needed";

export interface SetupInfo {
  reason: SetupReason;
  /** Short and safe to show: never a token or command output. */
  detail: string | null;
  issueCommand: string;
  installUrl: string;
}

export interface ConnectionStatus {
  t3: "connecting" | "live" | "offline" | "needs-token";
  serverVersion: string | null;
  protocolMismatch: boolean;
  error: string | null;
  /** Not null: the UI shows the full-screen setup. */
  setup: SetupInfo | null;
}

export interface HealthResult {
  ok: true;
  t3: ConnectionStatus["t3"];
  /** Version of the running binary: lets install tell this dashboard from another program. */
  version: string;
}
