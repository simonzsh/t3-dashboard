import type { SetupInfo, SetupReason } from "../../shared/api.ts";
import type { ReadFile } from "../config/config.ts";
import { INSTALL_URL, ISSUE_COMMAND, issueToken, type Run } from "../integrations/t3/cli.ts";
import type { Validation } from "../integrations/t3/client.ts";
import { authFile } from "../config/paths.ts";

type Env = Record<string, string | undefined>;

export interface TokenManagerOptions {
  env: Env;
  homedir: string;
  readFile: ReadFile;
  writeSecret(file: string, text: string): void;
  run: Run;
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

/** Owns the T3 token: where it comes from, how it is checked, and what to show when none works. */
export class TokenManager {
  private readonly options: TokenManagerOptions;
  private readonly file: string;
  private token: string | null = null;
  private setupInfo: SetupInfo | null = null;
  private inflight: Promise<void> | null = null;

  constructor(options: TokenManagerOptions) {
    this.options = options;
    this.file = authFile(options.env, options.homedir);
  }

  current(): string | null {
    return this.token;
  }

  setup(): SetupInfo | null {
    return this.setupInfo;
  }

  refresh(): Promise<void> {
    this.inflight ??= this.resolve().finally(() => (this.inflight = null));
    return this.inflight;
  }

  async paste(token: string): Promise<"ok" | "rejected" | "unreachable" | "locked"> {
    // The token file wins on every refresh: a pasted token would be stored and ignored.
    if (this.options.env.T3_DASHBOARD_TOKEN_FILE) return "locked";
    const trimmed = token.trim();
    const verdict = await this.options.validate(trimmed);
    if (verdict === "ok") this.adopt(trimmed, "pasted");
    return verdict;
  }

  private use(token: string): void {
    this.token = token;
    this.setupInfo = null;
  }

  private fail(reason: SetupReason, detail: string | null): void {
    this.token = null;
    this.setupInfo = { reason, detail, issueCommand: ISSUE_COMMAND, installUrl: INSTALL_URL };
  }

  // A failed write is not fatal: the token still works until the next restart.
  private adopt(token: string, source: "issued" | "pasted"): void {
    this.use(token);
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
      if (token !== null && (await validate(token)) !== "rejected") return this.use(token);
      return this.fail("token-needed", token === null ? "The token file cannot be read" : "T3 Code refused the token in the token file");
    }
    const raw = tryRead(readFile, this.file);
    const stored = raw === null ? null : field(raw, "token");
    if (raw !== null && stored !== null && (await validate(stored)) !== "rejected") return this.use(stored);
    return this.issue();
  }

  private async issue(): Promise<void> {
    const { env, run, validate } = this.options;
    const t3 = this.options.findT3();
    let detail = "t3 command not found";
    if (t3 !== null) {
      const { code, token } = await issueToken(run, t3, env);
      detail = code === null ? "t3 auth session issue did not finish" : code === 0 ? "t3 auth session issue returned no token" : `t3 auth session issue failed (exit ${code})`;
      if (token !== null) {
        if ((await validate(token)) !== "rejected") return this.adopt(token, "issued");
        detail = "T3 Code refused the new token";
      }
    }
    if ((await validate("")) !== "unreachable") return this.fail("token-needed", detail);
    return this.fail(t3 === null ? "t3-missing" : "t3-stopped", null);
  }
}
