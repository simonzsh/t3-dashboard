import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { InstallDeps } from "./install.ts";
import type { UpdateDeps } from "./update.ts";
import { VERSION } from "./version.ts";

const DEFAULT_REPO = "simonzsh/t3-dashboard";

/** Exit code of a program, or 127 when it did not start. Its output is dropped. */
async function run(command: string, args: string[]): Promise<number> {
  try {
    const child = Bun.spawn([command, ...args], { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
    return await child.exited;
  } catch {
    return 127;
  }
}

async function open(url: string): Promise<void> {
  const [command, args] =
    process.platform === "darwin" ? ["open", [url]] : process.platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  if ((await run(command!, args as string[])) !== 0) throw new Error("could not open the browser");
}

/** Real file-system and process access, kept out of the logic so tests never touch the machine. */
export function installDeps(env: Record<string, string | undefined>): InstallDeps {
  return {
    platform: process.platform,
    exe: process.execPath,
    home: homedir(),
    uid: process.getuid?.() ?? 0,
    env,
    path: env.PATH ?? "",
    run,
    writeFile: (path, content) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, content);
    },
    rm: (path) => rmSync(path, { force: true }),
    mkdir: (path) => void mkdirSync(path, { recursive: true, mode: 0o700 }),
    exists: existsSync,
    readFile: (path) => readFileSync(path, "utf8"),
    hasCommand: (name) => Bun.which(name) !== null,
    version: VERSION,
    probeHealth: async (url) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(1_000) });
        if (!res.ok) return null;
        const version = ((await res.json().catch(() => null)) as { version?: unknown } | null)?.version;
        return { version: typeof version === "string" ? version : null };
      } catch {
        return null;
      }
    },
    sleep: (ms) => sleep(ms),
    now: () => Date.now(),
    open,
    log: (message) => console.log(message),
  };
}

export function updateDeps(env: Record<string, string | undefined>, restart: (version: string) => Promise<void>, serviceInstalled: () => Promise<boolean>): UpdateDeps {
  return {
    fetch,
    repo: env.T3_DASHBOARD_REPO ?? DEFAULT_REPO,
    version: VERSION,
    exe: process.execPath,
    platform: process.platform,
    arch: process.arch,
    writeFile: (path, bytes) => writeFileSync(path, bytes),
    chmod: chmodSync,
    rename: renameSync,
    rm: (path) => rmSync(path, { force: true }),
    restart,
    serviceInstalled,
    log: (message) => console.log(message),
  };
}
