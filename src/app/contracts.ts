import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { readLinearKey } from "../config/linearFile.ts";
import { authFile, linearFile } from "../config/paths.ts";
import type { SystemReport } from "../integrations/drift.ts";
import { checkGithub } from "../integrations/github/contracts.ts";
import { checkLinear } from "../integrations/linear/contracts.ts";
import { checkAgentFiles } from "../integrations/t3-agent/contracts.ts";
import { agentConfigDir } from "../integrations/t3-agent/files.ts";
import { checkT3 } from "../integrations/t3/contracts.ts";

type Env = Record<string, string | undefined>;

const readText = (path: string) => readFileSync(path, "utf8");

// The check is read-only: it takes the token the dashboard stored, never a new one.
function storedToken(env: Env, home: string): string | null {
  try {
    const token: unknown = JSON.parse(readText(env.T3_DASHBOARD_TOKEN_FILE ?? authFile(env, home))).token;
    return typeof token === "string" && token.trim() !== "" ? token.trim() : null;
  } catch {
    return null;
  }
}

/** Runs the contract checks of every outside system with the dashboard's own config. */
export function runContracts({ env, snapshotFile, updateSnapshot }: { env: Env; snapshotFile: string; updateSnapshot: boolean }): Promise<SystemReport[]> {
  const home = homedir();
  const linearKey = env.LINEAR_API_KEY?.trim() || readLinearKey(linearFile(env, home), readText);
  return Promise.all([
    checkT3({ env, homedir: home, token: storedToken(env, home), readFile: readText, snapshotFile, updateSnapshot }),
    checkLinear(linearKey),
    checkGithub(),
    checkAgentFiles(agentConfigDir(env, home)),
  ]);
}
