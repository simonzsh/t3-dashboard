import type { ReadFile } from "./config.ts";

// A missing or broken file means no dedicated thread: the grid then shows every thread.
export function readAutomationThreads(file: string, readFile: ReadFile): Set<string> {
  try {
    const ids = (JSON.parse(readFile(file)) as { threadIds?: unknown } | null)?.threadIds;
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function addAutomationThread(file: string, threadId: string, readFile: ReadFile, write: (file: string, text: string) => void): void {
  const ids = readAutomationThreads(file, readFile);
  if (ids.has(threadId)) return;
  ids.add(threadId);
  write(file, `${JSON.stringify({ threadIds: [...ids] }, null, 2)}\n`);
}
