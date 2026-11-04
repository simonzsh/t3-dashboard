import { normalizeStash, type StashEntry } from "../../shared/stash.ts";
import type { ReadFile } from "./config.ts";

// A missing or broken file means an empty stash.
export function readStash(file: string, readFile: ReadFile): StashEntry[] {
  try {
    return normalizeStash(JSON.parse(readFile(file))) ?? [];
  } catch {
    return [];
  }
}

export const stashText = (entries: StashEntry[]): string => `${JSON.stringify({ entries }, null, 2)}\n`;
