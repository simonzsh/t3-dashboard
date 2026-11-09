import type { UpdateChannel } from "../../shared/updates.ts";
import type { ReadFile } from "./config.ts";

export function readUpdateChannel(file: string, readFile: ReadFile): UpdateChannel | null {
  try {
    const value: unknown = JSON.parse(readFile(file));
    if (typeof value !== "object" || value === null || !("channel" in value)) return null;
    return value.channel === "main" || value.channel === "stable" ? value.channel : null;
  } catch {
    return null;
  }
}

export const updateChannelText = (channel: UpdateChannel): string => `${JSON.stringify({ channel }, null, 2)}\n`;
