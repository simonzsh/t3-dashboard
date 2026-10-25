import type { ReadFile } from "./config.ts";
import { authFile } from "./paths.ts";

type Env = Record<string, string | undefined>;

// An empty T3_DASHBOARD_TOKEN_FILE counts as unset, like everywhere else.
export const tokenFile = (env: Env, homedir: string): string => env.T3_DASHBOARD_TOKEN_FILE || authFile(env, homedir);

/** The trimmed `token` field of the token file, or null when the file is missing, broken or empty. */
export function readStoredToken(env: Env, homedir: string, readFile: ReadFile): string | null {
  try {
    const token = (JSON.parse(readFile(tokenFile(env, homedir))) as Record<string, unknown> | null)?.token;
    return typeof token === "string" && token.trim() !== "" ? token.trim() : null;
  } catch {
    return null;
  }
}
