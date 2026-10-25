// Settings and self-update.

export interface LinearSettings {
  connected: boolean;
  /** Last 4 characters at most: the key itself never leaves the server. */
  keyTail: string | null;
  /** The file uses the old workspaces list: the first save converts it and keeps the first workspace only. */
  legacy: boolean;
}

export interface SettingsResult {
  linear: LinearSettings;
}

export interface LinearKeyBody {
  apiKey: string;
}

export interface UpdateStatus {
  current: string;
  latest: string | null;
  available: boolean;
  canUpdate: boolean;
  /** One sentence that says why `canUpdate` is false. */
  reason: string | null;
  updating: boolean;
  /** Why the last update failed: the page shows it. */
  error: string | null;
}
