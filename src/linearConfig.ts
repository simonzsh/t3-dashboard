import { join } from "node:path";
import type { ReadFile } from "./config.ts";

export interface LinearWorkspaceConfig {
  name: string;
  apiKey: string;
  t3Project: string;
}

export const linearFile = (env: Record<string, string | undefined>, homedir: string): string =>
  env.T3_DASHBOARD_LINEAR_FILE ?? join(homedir, ".config", "t3-dashboard", "linear.json");

const text = (value: unknown): string => (typeof value === "string" ? value : "");

// A missing or broken file is not fatal: the board then shows no workspace.
// The content is never quoted, since it holds the keys.
export function readLinearWorkspaces(file: string, readFile: ReadFile): LinearWorkspaceConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(file));
  } catch {
    return [];
  }
  const list = (parsed as { workspaces?: unknown } | null)?.workspaces;
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry: unknown) => {
    const { name, apiKey, t3Project } = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    return text(name) === "" ? [] : [{ name: text(name), apiKey: text(apiKey).trim(), t3Project: text(t3Project) }];
  });
}
