import { existsSync } from "node:fs";
import { join } from "node:path";
import type { SetupInfo, SetupReason, TokenSource } from "../shared/api.ts";
import type { ReadFile } from "./config.ts";
import { authFile } from "./paths.ts";

export const INSTALL_URL = "https://t3.codes";
const ISSUE_ARGS = ["auth", "session", "issue", "--ttl", "3650d", "--label", "T3 Dashboard", "--token-only"];
export const ISSUE_COMMAND = `t3 ${ISSUE_ARGS.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg)).join(" ")}`;
const ISSUE_TIMEOUT_MS = 20_000;

export type Validation = "ok" | "rejected" | "unreachable";
/** `code` is null when the program did not start or did not finish in time. Only stdout is kept. */
export interface RunResult {
  code: number | null;
  stdout: string;
}

type Env = Record<string, string | undefined>;

export interface TokenManagerOptions {
  env: Env;
  homedir: string;
  readFile: ReadFile;
  writeSecret(file: string, text: string): void;
  run(command: string, args: string[], options: { timeoutMs: number }): Promise<RunResult>;
  findT3(): string | null;
  /** An empty token probes the server: 401 or 403 means it is up. */
  validate(token: string): Promise<Validation>;
  log(message: string): void;
  now?: () => Date;
}

const field = (text: string, name: string): string | null => {
  try {
    const value = (JSON.parse(text) as Record<string, unknown> | null)?.[name];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  } catch {
    return null;
  }
};

const tryRead = (readFile: ReadFile, path: string): string | null => {
  try {
    return readFile(path);
  } catch {
    return null;
  }
};

/** Looks for the t3 program: a service starts with a short PATH, so common folders are tried too. */
export function locateT3(env: Env, homedir: string, exists: (path: string) => boolean, which: (name: string) => string | null): string | null {
  if (env.T3_DASHBOARD_T3_BIN) return exists(env.T3_DASHBOARD_T3_BIN) ? env.T3_DASHBOARD_T3_BIN : null;
  const local = env.LOCALAPPDATA;
  const candidates = [
    join(homedir, ".local", "bin", "t3"),
    "/opt/homebrew/bin/t3",
    "/usr/local/bin/t3",
    ...(local ? [join(local, "Programs", "t3", "t3.exe"), join(local, "Programs", "t3-code", "t3.exe")] : []),
  ];
  return which("t3") ?? candidates.find(exists) ?? null;
}

export const findT3 = (env: Env, homedir: string): string | null => locateT3(env, homedir, existsSync, (name) => Bun.which(name));

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

/** Checks a token with T3: 2xx is ok, 401 or 403 is rejected, anything else is unreachable. */
export function validateWith(origin: () => string, fetchImpl: typeof fetch = fetch) {
  return async (token: string): Promise<Validation> => {
    try {
      const response = await fetchImpl(`${origin().replace(/\/+$/, "")}/api/auth/websocket-ticket`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return "ok";
      return response.status === 401 || response.status === 403 ? "rejected" : "unreachable";
    } catch {
      return "unreachable";
    }
  };
}

/** Owns the T3 token: where it comes from, how it is checked, and what to show when none works. */
export class TokenManager {
  private readonly options: TokenManagerOptions;
  private readonly file: string;
  private token: string | null = null;
  private tokenSource: TokenSource | null = null;
  private setupInfo: SetupInfo | null = null;
  private inflight: Promise<void> | null = null;

  constructor(options: TokenManagerOptions) {
    this.options = options;
    this.file = authFile(options.env, options.homedir);
  }

  current(): string | null {
    return this.token;
  }

  source(): TokenSource | null {
    return this.tokenSource;
  }

  setup(): SetupInfo | null {
    return this.setupInfo;
  }

  refresh(): Promise<void> {
    this.inflight ??= this.resolve().finally(() => (this.inflight = null));
    return this.inflight;
  }

  async paste(token: string): Promise<"ok" | "rejected" | "unreachable"> {
    const trimmed = token.trim();
    const verdict = await this.options.validate(trimmed);
    if (verdict === "ok") this.adopt(trimmed, "pasted");
    return verdict;
  }

  private use(token: string, source: TokenSource): void {
    this.token = token;
    this.tokenSource = source;
    this.setupInfo = null;
  }

  private fail(reason: SetupReason, detail: string | null): void {
    this.token = null;
    this.tokenSource = null;
    this.setupInfo = { reason, detail, issueCommand: ISSUE_COMMAND, installUrl: INSTALL_URL };
  }

  // A failed write is not fatal: the token still works until the next restart.
  private adopt(token: string, source: "issued" | "pasted"): void {
    this.use(token, source);
    try {
      const now = this.options.now?.() ?? new Date();
      this.options.writeSecret(this.file, `${JSON.stringify({ token, source, createdAt: now.toISOString() }, null, 2)}\n`);
      if (source === "issued") this.options.log(`Created a T3 Code token for the dashboard (stored in ${this.file})`);
    } catch {
      this.options.log(`Could not store the T3 Code token in ${this.file}`);
    }
  }

  private async resolve(): Promise<void> {
    const { env, readFile, validate } = this.options;
    if (env.T3_DASHBOARD_TOKEN_FILE) {
      const raw = tryRead(readFile, env.T3_DASHBOARD_TOKEN_FILE);
      const token = raw === null ? null : field(raw, "token");
      if (token !== null && (await validate(token)) !== "rejected") return this.use(token, "env-file");
      return this.fail("token-needed", token === null ? "The token file cannot be read" : "T3 Code refused the token in the token file");
    }
    const raw = tryRead(readFile, this.file);
    const stored = raw === null ? null : field(raw, "token");
    if (raw !== null && stored !== null && (await validate(stored)) !== "rejected") {
      const source = field(raw, "source");
      return this.use(stored, source === "issued" || source === "pasted" ? source : "stored");
    }
    return this.issue();
  }

  private async issue(): Promise<void> {
    const { env, run, validate } = this.options;
    const t3 = this.options.findT3();
    let detail = "t3 command not found";
    if (t3 !== null) {
      const args = env.T3CODE_HOME ? [...ISSUE_ARGS, "--base-dir", env.T3CODE_HOME] : ISSUE_ARGS;
      const { code, stdout } = await run(t3, args, { timeoutMs: ISSUE_TIMEOUT_MS });
      const lines = stdout.split("\n").map((line) => line.trim()).filter((line) => line !== "");
      detail = code === null ? "t3 auth session issue did not finish" : `t3 auth session issue failed (exit ${code})`;
      if (code === 0) {
        detail = "t3 auth session issue returned no token";
        const [token] = lines;
        if (lines.length === 1 && token !== undefined) {
          if ((await validate(token)) !== "rejected") return this.adopt(token, "issued");
          detail = "T3 Code refused the new token";
        }
      }
    }
    if ((await validate("")) !== "unreachable") return this.fail("token-needed", detail);
    return this.fail(t3 === null ? "t3-missing" : "t3-stopped", null);
  }
}
