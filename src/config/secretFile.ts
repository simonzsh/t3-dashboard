import { chmodSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Write to a private temp file, then rename: a crash never leaves a half-written secret.
export function writeSecret(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, text, { mode: 0o600 });
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
  chmodSync(file, 0o600);
}
