import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { format } from "node:util";

/** Writes the pid file and returns a cleanup that removes it, unless another process took it over. */
export function writePidFile(file: string, pid: number): () => void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(file, `${pid}\n`);
  return () => {
    try {
      if (readFileSync(file, "utf8").trim() === String(pid)) rmSync(file, { force: true });
    } catch {
      // Already gone.
    }
  };
}

/** Sends console output to a file: a Windows logon task has no stdout to capture. */
export function redirectConsole(file: string, target: Console = console): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const write = (...args: unknown[]) => appendFileSync(file, `${new Date().toISOString()} ${format(...args)}\n`);
  for (const name of ["log", "info", "warn", "error"] as const) target[name] = write;
}
