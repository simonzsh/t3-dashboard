import { normalizeSessions, type SharedSessions } from "../../shared/sessions.ts";
import type { ReadFile } from "./config.ts";

// A broken file means no saved sessions: the first browser then pushes its own.
// Only a missing new file falls back to the old desk.json, which is never written.
export function readSessions(file: string, legacyFile: string, readFile: ReadFile): SharedSessions | null {
  let text: string;
  try {
    text = readFile(file);
  } catch {
    return parse(legacyFile, readFile);
  }
  return parseText(text);
}

function parse(file: string, readFile: ReadFile): SharedSessions | null {
  try {
    return parseText(readFile(file));
  } catch {
    return null;
  }
}

function parseText(text: string): SharedSessions | null {
  try {
    return normalizeSessions(JSON.parse(text));
  } catch {
    return null;
  }
}

export const sessionsText = (sessions: SharedSessions): string => `${JSON.stringify(sessions, null, 2)}\n`;
