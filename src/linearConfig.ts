import type { TeamTable } from "../shared/api.ts";
import type { ReadFile } from "./config.ts";

export type Unlisted = "show" | "hide";

export interface LinearWorkspaceConfig {
  name: string;
  apiKey: string;
  t3Project: string;
  // Team key -> T3 project title. "" asks when assigning, null hides the team.
  teams: TeamTable | null;
  // What happens to a team missing from the table.
  unlisted: Unlisted;
}

/** The file the dashboard writes: one key, one team table. */
export interface SimpleLinearConfig {
  apiKey: string;
  teams: TeamTable;
  unlisted: Unlisted;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

const teamTable = (value: unknown): TeamTable | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return Object.fromEntries(Object.entries(value).filter((pair): pair is [string, string | null] => typeof pair[1] === "string" || pair[1] === null));
};

// An existing table keeps hiding unlisted teams, so a shared key never mixes companies.
const unlistedOf = (value: unknown, teams: TeamTable | null): Unlisted => (value === "show" || value === "hide" ? value : teams ? "hide" : "show");

// A missing or broken file is not fatal: the board then shows no workspace.
// The content is never quoted, since it holds the keys.
export function readLinearFile(file: string, readFile: ReadFile): { workspaces: LinearWorkspaceConfig[]; legacy: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(file));
  } catch {
    return { workspaces: [], legacy: false };
  }
  const root = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (!Array.isArray(root.workspaces)) {
    const teams = teamTable(root.teams);
    const single = "apiKey" in root || "teams" in root;
    return { workspaces: single ? [{ name: "Linear", apiKey: text(root.apiKey).trim(), t3Project: "", teams, unlisted: unlistedOf(root.unlisted, teams) }] : [], legacy: false };
  }
  const workspaces = root.workspaces.flatMap((entry: unknown) => {
    const { name, apiKey, t3Project, teams, unlisted } = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    const table = teamTable(teams);
    return text(name) === "" ? [] : [{ name: text(name), apiKey: text(apiKey).trim(), t3Project: text(t3Project), teams: table, unlisted: unlistedOf(unlisted, table) }];
  });
  return { workspaces, legacy: true };
}

export const readLinearWorkspaces = (file: string, readFile: ReadFile): LinearWorkspaceConfig[] => readLinearFile(file, readFile).workspaces;

/** Keeps the first workspace that has a key (else the first one, so a disconnected table survives). */
export function toSimple(workspaces: LinearWorkspaceConfig[]): SimpleLinearConfig {
  const first = workspaces.find((workspace) => workspace.apiKey !== "") ?? workspaces[0];
  if (!first) return { apiKey: "", teams: {}, unlisted: "show" };
  return { apiKey: first.apiKey, teams: first.teams ?? {}, unlisted: first.unlisted };
}

export function writeLinearConfig(file: string, next: SimpleLinearConfig, writeSecret: (file: string, text: string) => void): void {
  writeSecret(file, `${JSON.stringify({ apiKey: next.apiKey, teams: next.teams, unlisted: next.unlisted }, null, 2)}\n`);
}
