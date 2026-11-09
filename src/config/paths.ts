import { join, resolve, win32 } from "node:path";

type Env = Record<string, string | undefined>;

export const configDir = (env: Env, homedir: string): string => env.T3_DASHBOARD_CONFIG_DIR ?? join(homedir, ".config", "t3-dashboard");

export const authFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "auth.json");

export const linearFile = (env: Env, homedir: string): string => env.T3_DASHBOARD_LINEAR_FILE ?? join(configDir(env, homedir), "linear.json");
export const updatesFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "updates.json");

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

/** The phone alerts: the ntfy topic and the threads armed for one alert. */
export const alertsFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "alerts.json");

/** Stashed composer drafts, shared by every device. */
export const stashFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "stash.json");

export interface AgentRulesTarget {
  agent: "claude" | "codex" | "opencode" | "grok";
  /** The agent's config folder. */
  dir: string;
  /** The global instruction file inside `dir`. */
  file: string;
  /** False: write only when `dir` already exists, so an agent that is not installed gets no folder. */
  always: boolean;
  /** True when the agent reads `@path` lines in this file as includes. */
  imports: boolean;
}

// Cursor keeps global rules in the account, not in a file. Grok reads AGENTS.md in ~/.grok (docs.x.ai).
// Antigravity is left out: T3 Code runs it with a private GEMINI_HOME, so ~/.gemini/GEMINI.md never reaches it.
// OpenCode: OPENCODE_CONFIG_DIR adds a folder and does not replace the global one, so only XDG applies.
export function agentRulesTargets(env: Env, homedir: string): AgentRulesTarget[] {
  const target = (agent: AgentRulesTarget["agent"], dir: string, file: string, always: boolean, imports: boolean): AgentRulesTarget => ({ agent, dir, file: join(dir, file), always, imports });
  return [
    target("claude", env.CLAUDE_CONFIG_DIR ?? join(homedir, ".claude"), "CLAUDE.md", true, true),
    target("codex", env.CODEX_HOME ?? join(homedir, ".codex"), "AGENTS.md", true, false),
    target("opencode", join(env.XDG_CONFIG_HOME ?? join(homedir, ".config"), "opencode"), "AGENTS.md", false, false),
    target("grok", join(homedir, ".grok"), "AGENTS.md", false, false),
  ];
}

/** Reminders re-armed from the dashboard after a run, so the guard does not pause them again. */
export const rearmedFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "rearmed-reminders.json");

/** The runs of each scheduled task, kept by the dashboard because T3 keeps only the last one. */
export const automationRunsFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "automation-runs.json");

/** The news: its settings and the id of its T3 task. */
export const newsFile = (env: Env, homedir: string): string => join(configDir(env, homedir), "news.json");

/** Where the agent writes one Markdown article per day. Absolute: the task prompt names it. */
export const newsDir = (env: Env, homedir: string): string => resolve(configDir(env, homedir), "news");
