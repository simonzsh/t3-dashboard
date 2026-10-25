import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Brain {
  name: string;
  workspace: string | null;
  projectId: string | null;
  error: string | null;
}

export const agentConfigDir = (env: Record<string, string | undefined>, homedir: string): string =>
  env.T3_DASHBOARD_AGENT_CONFIG_DIR ?? join(homedir, ".config", "t3-agent");

const text = (value: unknown): string | null => (typeof value === "string" && value !== "" ? value : null);

// These files also hold a token: only `workspace` and `projectId` leave this function,
// and errors never quote the content.
export function loadBrains(dir: string): Brain[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name.slice(0, -".json".length))
    .sort()
    .map((name) => {
      try {
        const parsed = JSON.parse(readFileSync(join(dir, `${name}.json`), "utf8")) as { workspace?: unknown; projectId?: unknown } | null;
        const workspace = text(parsed?.workspace);
        if (!workspace) return { name, workspace: null, projectId: null, error: "Champ workspace absent" };
        return { name, workspace, projectId: text(parsed?.projectId), error: null };
      } catch {
        return { name, workspace: null, projectId: null, error: "Fichier de config illisible" };
      }
    });
}
