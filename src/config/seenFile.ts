import { normalizeSeen, type SeenState } from "../../shared/seen.ts";
import type { ReadFile } from "./config.ts";

// A missing or broken file means no saved state: the first browser then sets the baseline.
export function readSeen(file: string, readFile: ReadFile): SeenState | null {
  try {
    return normalizeSeen(JSON.parse(readFile(file)));
  } catch {
    return null;
  }
}

export const seenText = (seen: SeenState): string => `${JSON.stringify(seen, null, 2)}\n`;
