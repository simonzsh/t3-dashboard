import type { ReadFile } from "./config.ts";

// Older versions wrote this file; it is read only now. A missing or broken file means no dedicated thread: the grid then shows every thread.
export function readAutomationThreads(file: string, readFile: ReadFile): Set<string> {
  try {
    const ids = (JSON.parse(readFile(file)) as { threadIds?: unknown } | null)?.threadIds;
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}
