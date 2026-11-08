import { existsSync } from "node:fs";
import { join } from "node:path";

type Env = Record<string, string | undefined>;

/** `code` is null when gh did not start or did not finish in time. Only stdout is kept, up to `maxBytes`. */
export interface GhResult {
  code: number | null;
  stdout: string;
  truncated: boolean;
}

export type GhRun = (args: string[], options?: { timeoutMs?: number; maxBytes?: number }) => Promise<GhResult>;

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

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

/** Spawns gh without a shell. stderr is dropped: it can echo tokens or private titles. */
export function ghRunner(env: Env, homedir: string): GhRun {
  return async (args, { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = DEFAULT_MAX_BYTES } = {}) => {
    const bin = locateGh(env, homedir, existsSync, (name) => Bun.which(name));
    if (!bin) return { code: null, stdout: "", truncated: false };
    try {
      const child = Bun.spawn([bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "ignore", env: { ...env, GH_PROMPT_DISABLED: "1", NO_COLOR: "1" } });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      const { text, truncated } = await readCapped(child.stdout, maxBytes);
      if (truncated) child.kill();
      const code = await child.exited;
      clearTimeout(timer);
      // Killing gh after a capped read is not a failure.
      return { code: timedOut ? null : truncated ? 0 : code, stdout: text, truncated };
    } catch {
      return { code: null, stdout: "", truncated: false };
    }
  };
}
