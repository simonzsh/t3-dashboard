export const NTFY_DEFAULT_SERVER = "https://ntfy.sh";
export const ALERTS_ARMED_MAX = 100;
export const ALERT_CLICK_MAX = 2048;
const ALERT_SERVER_MAX = 256;

export const isAlertTopic = (s: string): boolean => /^[A-Za-z0-9_-]{1,64}$/.test(s);

function httpUrl(s: string): URL | null {
  try {
    const url = new URL(s);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

/** The server URL without its trailing slash, or null when it is not a plain http(s) URL. */
export function alertServer(s: string): string | null {
  const url = httpUrl(s);
  if (!url || s.length > ALERT_SERVER_MAX || s.includes("?") || s.includes("#") || url.username || url.password) return null;
  return s.replace(/\/+$/, "");
}

export const isAlertServer = (s: string): boolean => alertServer(s) !== null;
export const isAlertClick = (s: string): boolean => s.length <= ALERT_CLICK_MAX && httpUrl(s) !== null;

/** Shared with every device over SSE: what the session bell needs. No topic here. */
export interface AlertsState {
  configured: boolean;
  armed: string[];
}

/** For Settings > Alerts only. The topic is shown in full: the user must subscribe to it. */
export interface AlertsSettings {
  connected: boolean;
  server: string | null;
  topic: string | null;
  /** `${server}/${topic}` */
  subscribeUrl: string | null;
}

export interface AlertsSetupBody {
  server?: string;
}

export interface AlertsTopicBody {
  topic: string;
  server?: string;
}

export interface AlertArmBody {
  clickUrl: string;
}

export type AlertTestResult = { result: "ok" | "refused" | "unreachable" };
