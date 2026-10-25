import { join } from "node:path";
import { t3Home } from "./paths.ts";

export const DEFAULT_ORIGIN = "http://127.0.0.1:3773";
export const DEFAULT_PORT = 4300;

export type ReadFile = (path: string) => string;

export interface Config {
  port: number;
  /** Extra Host and Origin names, besides 127.0.0.1 and localhost. */
  allowedHosts: string[];
  runtimeFile: string;
  /** Names this T3 install in t3code:// links. */
  environmentIdFile: string;
}

/** The PORT variable; an empty or invalid value means the default port. */
export function envPort(env: Record<string, string | undefined>): number {
  const port = Number(env.PORT);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PORT;
}

export function loadConfig(env: Record<string, string | undefined>, homedir: string): Config {
  return {
    port: envPort(env),
    allowedHosts: (env.T3_DASHBOARD_ALLOWED_HOSTS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean),
    runtimeFile: env.T3_SERVER_RUNTIME ?? join(t3Home(env, homedir), "userdata", "server-runtime.json"),
    environmentIdFile: join(t3Home(env, homedir), "userdata", "environment-id"),
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

const ENVIRONMENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The T3 environment id, or null when the file is missing or holds something else. */
export function readEnvironmentId(file: string, readFile: ReadFile): string | null {
  try {
    const id = readFile(file).trim();
    return ENVIRONMENT_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}
