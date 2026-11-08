import { existsSync } from "node:fs";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

/** `code` is null when gh did not start or did not finish in time. Only stdout is kept, up to `maxBytes`. */
export interface GhResult {
  code: number | null;
  stdout: string;
  truncated: boolean;
  /** gh said the repository or the pull request does not exist (or is not visible). */
  notFound?: boolean;
}

export type GhRun = (args: string[], options?: { timeoutMs?: number; maxBytes?: number }) => Promise<GhResult>;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
const STDERR_BYTES = 4096;
// gh has no exit code for "not found": its message is the only sign. The text itself is never kept.
const NOT_FOUND = /Could not resolve to a (PullRequest|Repository)\b|HTTP 404\b/;

/** A service starts with a short PATH, so the usual install folders are tried after it. */
export function locateGh(env: Env, homedir: string, exists: (path: string) => boolean, which: (name: string) => string | null): string | null {
  if (env.T3_DASHBOARD_GH_BIN) return exists(env.T3_DASHBOARD_GH_BIN) ? env.T3_DASHBOARD_GH_BIN : null;
  const candidates = ["/usr/bin/gh", "/usr/local/bin/gh", "/opt/homebrew/bin/gh", join(homedir, ".local", "bin", "gh")];
  return which("gh") ?? candidates.find(exists) ?? null;
}

async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<{ text: string; truncated: boolean }> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      chunks.push(value.subarray(0, value.length - (size - maxBytes)));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated };
}

/** Spawns gh without a shell. stderr is only matched for "not found": it can echo tokens or private titles. */
export function ghRunner(env: Env, homedir: string): GhRun {
  return async (args, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = {}) => {
    const bin = locateGh(env, homedir, existsSync, (name) => Bun.which(name));
    if (!bin) return { code: null, stdout: "", truncated: false };
    try {
      const child = Bun.spawn([bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", env: { ...env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      const [{ text, truncated }, errors] = await Promise.all([
        // Stop gh at the cap, so the stderr read below ends too.
        readCapped(child.stdout, maxBytes).then((out) => {
          if (out.truncated) child.kill();
          return out;
        }),
        readCapped(child.stderr, STDERR_BYTES).catch(() => ({ text: "", truncated: false })),
      ]).finally(() => clearTimeout(timer));
      const code = await child.exited;
      if (timedOut) return { code: null, stdout: text, truncated };
      // Killing gh after a capped read is not a failure.
      return { code: truncated ? 0 : code, stdout: text, truncated, notFound: code !== 0 && NOT_FOUND.test(errors.text) };
    } catch {
      return { code: null, stdout: "", truncated: false };
    }
  };
}
