import { join, win32 } from "node:path";

type Env = Record<string, string | undefined>;

export const configDir = (env: Env, homedir: string): string => env.T3_DASHBOARD_CONFIG_DIR ?? join(homedir, ".config", "t3-dashboard");

export const authFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "auth.json");

export const linearFile = (env: Env, homedir: string): string => env.T3_DASHBOARD_LINEAR_FILE ?? join(configDir(env, homedir), "linear.json");

export type Platform = NodeJS.Platform;

// Windows paths are built with win32 rules even when tests run on another OS.
export function stateDir(env: Env, homedir: string, platform: Platform): string {
  if (platform === "darwin") return join(homedir, "Library", "Logs", "t3-dashboard");
  if (platform === "win32") return win32.join(env.LOCALAPPDATA ?? win32.join(homedir, "AppData", "Local"), "t3-dashboard");
  return join(env.XDG_STATE_HOME ?? join(homedir, ".local", "state"), "t3-dashboard");
}

const inStateDir = (name: string) => (env: Env, homedir: string, platform: Platform): string => {
  const dir = stateDir(env, homedir, platform);
  return platform === "win32" ? win32.join(dir, name) : join(dir, name);
};

export const logFile = inStateDir("dashboard.log");
export const pidFile = inStateDir("dashboard.pid");
