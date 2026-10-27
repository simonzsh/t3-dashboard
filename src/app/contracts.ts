import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { readLinearKey } from "../config/linearFile.ts";
import { linearFile } from "../config/paths.ts";
import { readStoredToken } from "../config/storedToken.ts";
import type { SystemReport } from "../integrations/drift.ts";
import { checkGithub } from "../integrations/github/contracts.ts";
import { checkLinear } from "../integrations/linear/contracts.ts";
import { checkT3 } from "../integrations/t3/contracts.ts";

type Env = Record<string, string | undefined>;

const readText = (path: string) => readFileSync(path, "utf8");

/** Runs the contract checks of every outside system with the dashboard's own config. */
export function runContracts({ env, snapshotFile, updateSnapshot }: { env: Env; snapshotFile: string; updateSnapshot: boolean }): Promise<SystemReport[]> {
  const home = homedir();
  const linearKey = env.LINEAR_API_KEY?.trim() || readLinearKey(linearFile(env, home), readText);
  // Read-only: the check takes the token the dashboard stored, never a new one.
  return Promise.all([
    checkT3({ env, homedir: home, token: readStoredToken(env, home, readText), readFile: readText, snapshotFile, updateSnapshot }),
    checkLinear(linearKey),
    checkGithub(),
  ]);
}
