import { join } from "node:path";

export const DEFAULT_ORIGIN = "http://127.0.0.1:3773";
const DEFAULT_PORT = 4310;

export type ReadFile = (path: string) => string;

export interface Config {
  port: number;
  tokenFile: string;
  runtimeFile: string;
  readToken(): string;
}

export function loadConfig(env: Record<string, string | undefined>, readFile: ReadFile, homedir: string): Config {
  const tokenFile = env.T3_DASHBOARD_TOKEN_FILE ?? join(homedir, ".config", "t3-agent", "perso.json");
  const runtimeFile = env.T3_SERVER_RUNTIME ?? join(homedir, ".t3", "userdata", "server-runtime.json");
  return {
    port: Number(env.PORT ?? DEFAULT_PORT),
    tokenFile,
    runtimeFile,
    readToken() {
      // Error messages name the file only: parse errors can quote the content.
      let parsed: unknown;
      try {
        parsed = JSON.parse(readFile(tokenFile));
      } catch {
        throw new Error(`Cannot read the T3 token file ${tokenFile}. Check that it exists and holds valid JSON.`);
      }
      const token = (parsed as { token?: unknown } | null)?.token;
      if (typeof token !== "string" || token === "") throw new Error(`The T3 token file ${tokenFile} has no "token" field.`);
      return token;
    },
  };
}

export function resolveOrigin(runtimeFile: string, readFile: ReadFile): string {
  try {
    const origin = (JSON.parse(readFile(runtimeFile)) as { origin?: unknown }).origin;
    if (typeof origin === "string" && origin !== "") return origin;
  } catch {
    // Fall through: T3 may not have written the file yet.
  }
  return DEFAULT_ORIGIN;
}
