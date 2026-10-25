import { join } from "node:path";
import type { ReadFile } from "./config.ts";

export interface LinearWorkspaceConfig {
  name: string;
  apiKey: string;
  t3Project: string;
  // Team key -> T3 project. With a table, only the listed teams are shown.
  teams: Record<string, string> | null;
}

export const linearFile = (env: Record<string, string | undefined>, homedir: string): string =>
  env.T3_DASHBOARD_LINEAR_FILE ?? join(homedir, ".config", "t3-dashboard", "linear.json");

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const teamTable = (value: unknown): Record<string, string> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string] => typeof pair[1] === "string"));
};

// A missing or broken file is not fatal: the board then shows no workspace.
// The content is never quoted, since it holds the keys.
export function readLinearWorkspaces(file: string, readFile: ReadFile): LinearWorkspaceConfig[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(file));
  } catch {
    return [];
  }
  const root = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (!Array.isArray(root.workspaces)) {
    return "apiKey" in root || "teams" in root ? [{ name: "Linear", apiKey: text(root.apiKey).trim(), t3Project: "", teams: teamTable(root.teams) }] : [];
  }
  return root.workspaces.flatMap((entry: unknown) => {
    const { name, apiKey, t3Project, teams } = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    return text(name) === "" ? [] : [{ name: text(name), apiKey: text(apiKey).trim(), t3Project: text(t3Project), teams: teamTable(teams) }];
  });
}
