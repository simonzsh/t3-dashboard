import type { ReadFile } from "./config.ts";

// A missing or broken file means no hidden task: the column then shows every reminder.
export function readHiddenAutomations(file: string, readFile: ReadFile): string[] {
  try {
    const ids = (JSON.parse(readFile(file)) as { taskIds?: unknown } | null)?.taskIds;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export const hiddenAutomationsText = (taskIds: readonly string[]): string => `${JSON.stringify({ taskIds }, null, 2)}\n`;
