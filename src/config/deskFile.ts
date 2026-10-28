import { normalizeDesk, type SharedDesk } from "../../shared/desk.ts";
import type { ReadFile } from "./config.ts";

// A missing or broken file means no saved desk: the first browser then pushes its own.
export function readDesk(file: string, readFile: ReadFile): SharedDesk | null {
  try {
    return normalizeDesk(JSON.parse(readFile(file)));
  } catch {
    return null;
  }
}

export const deskText = (desk: SharedDesk): string => `${JSON.stringify(desk, null, 2)}\n`;
