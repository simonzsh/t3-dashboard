import { join } from "node:path";
import type { ReadFile } from "../../config.ts";

type Env = Record<string, string | undefined>;

export const DEFAULT_ORIGIN = "http://127.0.0.1:3773";

/** Base folder of T3 Code: T3CODE_HOME, else ~/.t3. */
export const t3Home = (env: Env, homedir: string): string => env.T3CODE_HOME || join(homedir, ".t3");

/** Written by the running T3 server: its origin and version. */
export const runtimeFile = (env: Env, homedir: string): string => env.T3_SERVER_RUNTIME ?? join(t3Home(env, homedir), "userdata", "server-runtime.json");

/** Names this T3 install in t3code:// links. */
export const environmentIdFile = (env: Env, homedir: string): string => join(t3Home(env, homedir), "userdata", "environment-id");

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
