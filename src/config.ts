import { join } from "node:path";

export const DEFAULT_ORIGIN = "http://127.0.0.1:3773";
const DEFAULT_PORT = 4310;

export type ReadFile = (path: string) => string;

export interface Config {
  port: number;
  /** Set only by T3_DASHBOARD_TOKEN_FILE: the dashboard keeps its own token otherwise. */
  tokenFile: string | null;
  runtimeFile: string;
}

export function loadConfig(env: Record<string, string | undefined>, homedir: string): Config {
  return {
    port: Number(env.PORT ?? DEFAULT_PORT),
    tokenFile: env.T3_DASHBOARD_TOKEN_FILE || null,
    runtimeFile: env.T3_SERVER_RUNTIME ?? join(homedir, ".t3", "userdata", "server-runtime.json"),
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

/** The version of the running T3 server, from its runtime file, or null. */
export function readServerVersion(runtimeFile: string, readFile: ReadFile): string | null {
  try {
    const version = (JSON.parse(readFile(runtimeFile)) as { serverVersion?: unknown }).serverVersion;
    return typeof version === "string" && version !== "" ? version : null;
  } catch {
    return null;
  }
}
