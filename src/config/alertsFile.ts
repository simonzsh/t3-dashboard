import { ALERTS_ARMED_MAX, NTFY_DEFAULT_SERVER, alertServer, isAlertClick, isAlertTopic } from "../../shared/alerts.ts";
import type { ReadFile } from "./config.ts";

export interface ArmedAlert {
  threadId: string;
  clickUrl: string;
  armedAt: string;
}

export interface StoredAlerts {
  server: string;
  /** Null: not set up. */
  topic: string | null;
  armed: ArmedAlert[];
}

const fields = (value: unknown): Record<string, unknown> => (typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {});

function armedOf(value: unknown): ArmedAlert[] {
  const seen = new Set<string>();
  const out: ArmedAlert[] = [];
  for (const item of Array.isArray(value) ? value : []) {
    const { threadId, clickUrl, armedAt } = fields(item);
    if (typeof threadId !== "string" || threadId === "" || seen.has(threadId)) continue;
    if (typeof clickUrl !== "string" || !isAlertClick(clickUrl) || typeof armedAt !== "string") continue;
    seen.add(threadId);
    out.push({ threadId, clickUrl, armedAt });
  }
  return out.slice(0, ALERTS_ARMED_MAX);
}

// Each field falls back alone. Without a topic nothing can be sent, so nothing stays armed.
export function readAlerts(file: string, readFile: ReadFile): StoredAlerts {
  let root: Record<string, unknown> = {};
  try {
    root = fields(JSON.parse(readFile(file)));
  } catch {
    // A missing or broken file means not set up.
  }
  const topic = typeof root.topic === "string" && isAlertTopic(root.topic) ? root.topic : null;
  return {
    server: (typeof root.server === "string" && alertServer(root.server)) || NTFY_DEFAULT_SERVER,
    topic,
    armed: topic === null ? [] : armedOf(root.armed),
  };
}

export const alertsText = (stored: StoredAlerts): string => `${JSON.stringify({ version: 1, ...stored }, null, 2)}\n`;
