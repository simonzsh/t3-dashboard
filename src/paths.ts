import { join } from "node:path";

type Env = Record<string, string | undefined>;

export const configDir = (env: Env, homedir: string): string => env.T3_DASHBOARD_CONFIG_DIR ?? join(homedir, ".config", "t3-dashboard");

export const authFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "auth.json");

export const linearFile = (env: Env, homedir: string): string => env.T3_DASHBOARD_LINEAR_FILE ?? join(configDir(env, homedir), "linear.json");
