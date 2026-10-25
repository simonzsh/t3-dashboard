import type { BoardResult, DashboardProject, LinearTeam, TeamTable } from "../../shared/api.ts";

export const KEY_URL = "https://linear.app/settings/account/security";
export const KEY_PATH = ["Settings", "Account", "Security & access", "Personal API keys", "New API key"];

const REFUSED = "Linear refused this key";

/** The Board shows the setup card when there is no key or Linear refuses it. */
export function boardNeedsKey(board: BoardResult): boolean {
  if (!board.configured) return true;
  return board.workspaces.length > 0 && board.workspaces.every((workspace) => !workspace.ok && (workspace.error ?? "").startsWith(REFUSED));
}

export const keyLabel = (keyTail: string | null): string => (keyTail ? `Connected, key ending in ${keyTail}` : "Not connected");

export const unlistedRule = (unlisted: "show" | "hide"): string =>
  unlisted === "show" ? "Teams that are not listed here are shown." : "Teams that are not listed here are hidden.";

// A select holds one string: these prefixes keep a project title apart from the two fixed choices.
const ASK = "ask";
const HIDDEN = "hidden";
const PROJECT = "project:";

export const toChoice = (value: string | null): string => (value === null ? HIDDEN : value === "" ? ASK : `${PROJECT}${value}`);

export const fromChoice = (choice: string): string | null => (choice === HIDDEN ? null : choice === ASK ? "" : choice.slice(PROJECT.length));

export interface TeamRow {
  key: string;
  name: string;
  choice: string;
}

/** One row per Linear team, plus saved teams Linear no longer lists, so a save never drops them. */
export function teamRows(teams: LinearTeam[], table: TeamTable): TeamRow[] {
  const rows = new Map(teams.map((team) => [team.key, { key: team.key, name: team.name, choice: toChoice(Object.hasOwn(table, team.key) ? table[team.key]! : "") }]));
  for (const [key, value] of Object.entries(table)) if (!rows.has(key)) rows.set(key, { key, name: key, choice: toChoice(value) });
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Rows to a table. A team left on "Ask when assigning" stays out unless it was already saved. */
export function toTable(rows: TeamRow[], saved: TeamTable): TeamTable {
  return Object.fromEntries(rows.flatMap((row) => (row.choice === toChoice("") && !Object.hasOwn(saved, row.key) ? [] : [[row.key, fromChoice(row.choice)]])));
}

export interface ProjectOption {
  choice: string;
  label: string;
}

/** Project choices for a team. A saved title that no project has is kept and marked. */
export function projectOptions(projects: DashboardProject[], current: string | null): ProjectOption[] {
  const options = projects.map((project) => ({ choice: toChoice(project.title), label: project.title }));
  if (current && !projects.some((project) => project.title === current)) options.push({ choice: toChoice(current), label: `${current} (not found)` });
  return options;
}
