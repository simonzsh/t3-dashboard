import { existsSync } from "node:fs";

type Env = Record<string, string | undefined>;

/** `code` is null when tailscale did not start or did not finish in time; the output up to then stays. */
export interface TailscaleResult {
  code: number | null;
  stdout: string;
  stderr: string;
  missing?: boolean;
}

export type TailscaleRun = (args: string[], options: { timeoutMs: number }) => Promise<TailscaleResult>;

const STDERR_BYTES = 4096;
const KNOWN_PATHS = ["/usr/bin/tailscale", "/usr/local/bin/tailscale", "/opt/homebrew/bin/tailscale", "/Applications/Tailscale.app/Contents/MacOS/Tailscale"];

/** A service starts with a short PATH, so the usual install places are tried after it. */
export function locateTailscale(env: Env, exists: (path: string) => boolean, which: (name: string) => string | null): string | null {
  if (env.T3_DASHBOARD_TAILSCALE_BIN) return exists(env.T3_DASHBOARD_TAILSCALE_BIN) ? env.T3_DASHBOARD_TAILSCALE_BIN : null;
  const windows = env.ProgramFiles ? [`${env.ProgramFiles}\\Tailscale\\tailscale.exe`] : [];
  return which("tailscale") ?? [...KNOWN_PATHS, ...windows].find(exists) ?? null;
}

async function readCapped(stream: ReadableStream<Uint8Array>, maxBytes: number | null): Promise<string> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const room = maxBytes === null ? value.length : Math.min(value.length, maxBytes - size);
    if (room > 0) chunks.push(value.subarray(0, room));
    size += value.length;
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Spawns tailscale without a shell. stderr stays inside the integration: it is only matched for known causes. */
export function tailscaleRunner(env: Env): TailscaleRun {
  return async (args, { timeoutMs }) => {
    const bin = locateTailscale(env, existsSync, (name) => Bun.which(name));
    if (!bin) return { code: null, missing: true, stdout: "", stderr: "" };
    try {
      const child = Bun.spawn([bin, ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe" });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);
      const [stdout, stderr] = await Promise.all([readCapped(child.stdout, null), readCapped(child.stderr, STDERR_BYTES)]).finally(() => clearTimeout(timer));
      const code = await child.exited;
      return { code: timedOut ? null : code, stdout, stderr };
    } catch {
      return { code: null, stdout: "", stderr: "" };
    }
  };
}
