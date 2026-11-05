import type { ReadFile } from "./config.ts";

// A missing or broken file means no marks: a reminder that ran may then be paused once more.
export function readRearmed(file: string, readFile: ReadFile): Record<string, string> {
  try {
    const raw = JSON.parse(readFile(file)) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    return Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    return {};
  }
}

export const rearmedText = (marks: Record<string, string>): string => `${JSON.stringify(marks, null, 2)}\n`;
