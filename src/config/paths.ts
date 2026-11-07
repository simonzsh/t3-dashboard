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

/** Threads the Agents page created for a scheduled task. */
export const automationThreadsFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "automation-threads.json");

/** The finished threads each device has opened, shared by every device. */
export const seenFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "seen.json");

/** The open sessions, shared by every device. */
export const sessionsFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "sessions.json");

/** Stashed composer drafts, shared by every device. */
export const stashFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "stash.json");

/** The user rules file of Claude Code. */
export const claudeRulesFile = (env: Env, homedir: string): string => join(env.CLAUDE_CONFIG_DIR ?? join(homedir, ".claude"), "CLAUDE.md");

/** The user rules file of Codex. */
export const codexRulesFile = (env: Env, homedir: string): string => join(env.CODEX_HOME ?? join(homedir, ".codex"), "AGENTS.md");

/** Reminders re-armed from the dashboard after a run, so the guard does not pause them again. */
export const rearmedFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "rearmed-reminders.json");

/** The runs of each scheduled task, kept by the dashboard because T3 keeps only the last one. */
export const automationRunsFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "automation-runs.json");
