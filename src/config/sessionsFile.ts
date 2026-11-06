import { normalizeSessions, type SharedSessions } from "../../shared/sessions.ts";
import type { ReadFile } from "./config.ts";

// A missing or broken file means no saved sessions: the first browser then pushes its own.
export function readSessions(file: string, readFile: ReadFile): SharedSessions | null {
  try {
    return normalizeSessions(JSON.parse(readFile(file)));
  } catch {
    return null;
  }
}

export const sessionsText = (sessions: SharedSessions): string => `${JSON.stringify(sessions, null, 2)}\n`;
