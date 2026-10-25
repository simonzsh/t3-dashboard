import type { ReadFile } from "./config.ts";

export interface LinearWorkspaceConfig {
  name: string;
  apiKey: string;
}

/** The file the dashboard writes: the key and nothing else. */
export interface SimpleLinearConfig {
  apiKey: string;
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

// A missing or broken file is not fatal: the board then shows no workspace.
// The content is never quoted, since it holds the keys.
// Other fields of an old file (teams, unlisted) are ignored and vanish on the next write.
export function readLinearFile(file: string, readFile: ReadFile): { workspaces: LinearWorkspaceConfig[]; legacy: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFile(file));
  } catch {
    return { workspaces: [], legacy: false };
  }
  const root = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<string, unknown>;
  if (!Array.isArray(root.workspaces)) {
    return { workspaces: "apiKey" in root ? [{ name: "Linear", apiKey: text(root.apiKey).trim() }] : [], legacy: false };
  }
  const workspaces = root.workspaces.flatMap((entry: unknown) => {
    const { name, apiKey } = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
    return text(name) === "" ? [] : [{ name: text(name), apiKey: text(apiKey).trim() }];
  });
  return { workspaces, legacy: true };
}

export const readLinearWorkspaces = (file: string, readFile: ReadFile): LinearWorkspaceConfig[] => readLinearFile(file, readFile).workspaces;

/** Keeps the first workspace that has a key. */
export const toSimple = (workspaces: LinearWorkspaceConfig[]): SimpleLinearConfig => ({ apiKey: workspaces.find((workspace) => workspace.apiKey !== "")?.apiKey ?? "" });

export function writeLinearConfig(file: string, next: SimpleLinearConfig, writeSecret: (file: string, text: string) => void): void {
  writeSecret(file, `${JSON.stringify({ apiKey: next.apiKey }, null, 2)}\n`);
}
