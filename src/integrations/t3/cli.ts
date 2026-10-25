import { existsSync } from "node:fs";
import { join } from "node:path";
import { t3Home } from "./runtime.ts";

type Env = Record<string, string | undefined>;

export const INSTALL_URL = "https://t3.codes";
const ISSUE_ARGS = ["auth", "session", "issue", "--ttl", "3650d", "--label", "T3 Dashboard", "--token-only"];
export const ISSUE_COMMAND = `t3 ${ISSUE_ARGS.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`;
const ISSUE_TIMEOUT_MS = 20_000;

/** `code` is null when the program did not start or did not finish in time. Only stdout is kept. */
export interface RunResult {
  code: number | null;
  stdout: string;
}

export type Run = (command: string, args: string[], options: { timeoutMs: number }) => Promise<RunResult>;

/** Looks for the t3 program: a service starts with a short PATH, so common folders are tried too. */
export function locateT3(
  env: Env,
  homedir: string,
  exists: (path: string) => boolean,
  which: (name: string) => string | null,
  serverVersion: string | null = null,
): string | null {
  if (env.T3_DASHBOARD_T3_BIN) return exists(env.T3_DASHBOARD_T3_BIN) ? env.T3_DASHBOARD_T3_BIN : null;
  // The t3 on PATH can lag behind the running server, and an older CLI mints tokens the server refuses.
  if (serverVersion && /^[\w.-]+$/.test(serverVersion)) {
    const versionDir = join(t3Home(env, homedir), "runtime", "versions", serverVersion);
    const match = [join(versionDir, "t3"), join(versionDir, "t3.exe")].find(exists);
    if (match) return match;
  }
  const local = env.LOCALAPPDATA;
  const candidates = [
    join(homedir, ".local", "bin", "t3"),
    "/opt/homebrew/bin/t3",
    "/usr/local/bin/t3",
    ...(local ? [join(local, "Programs", "t3", "t3.exe"), join(local, "Programs", "t3-code", "t3.exe")] : []),
  ];
  return which("t3") ?? candidates.find(exists) ?? null;
}

export const findT3 = (env: Env, homedir: string, serverVersion: string | null = null): string | null =>
  locateT3(env, homedir, existsSync, (name) => Bun.which(name), serverVersion);

export async function runCommand(command: string, args: string[], { timeoutMs }: { timeoutMs: number }): Promise<RunResult> {
  try {
    const child = Bun.spawn([command, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore" });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const [stdout, code] = await Promise.all([new Response(child.stdout).text(), child.exited]);
    clearTimeout(timer);
    return { code: timedOut ? null : code, stdout };
  } catch {
    return { code: null, stdout: "" };
  }
}

/** Runs `t3 auth session issue`. `token` is set only on exit 0 with exactly one line of output. */
export async function issueToken(run: Run, t3: string, env: Env): Promise<{ code: number | null; token: string | null }> {
  const args = env.T3CODE_HOME ? [...ISSUE_ARGS, "--base-dir", env.T3CODE_HOME] : ISSUE_ARGS;
  const { code, stdout } = await run(t3, args, { timeoutMs: ISSUE_TIMEOUT_MS });
  const lines = stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
  return { code, token: code === 0 && lines.length === 1 ? lines[0]! : null };
}
