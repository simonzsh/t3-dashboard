import { createHash } from "node:crypto";
import { assetName, downloadAsset, latestTag, releaseSums } from "../integrations/github/releases.ts";
import { isNewer } from "../config/version.ts";

export interface UpdateDeps {
  fetch: typeof fetch;
  repo: string;
  version: string;
  exe: string;
  platform: string;
  arch: string;
  writeFile(path: string, bytes: Uint8Array): void;
  chmod(path: string, mode: number): void;
  rename(from: string, to: string): void;
  rm(path: string): void;
  /** Restarts the service and waits until it runs the given version. */
  restart(version: string): Promise<void>;
  serviceInstalled(): Promise<boolean>;
  log(message: string): void;
}

/** Resolves true when a new binary replaced the old one. */
export async function update({ check }: { check: boolean }, deps: UpdateDeps): Promise<boolean> {
  const tag = await latestTag(deps.fetch, deps.repo);
  const latest = tag.replace(/^v/, "");
  if (!isNewer(latest, deps.version)) return deps.log(`t3-dashboard ${latest} is up to date.`), false;
  if (check) return deps.log(`Update available: ${deps.version} -> ${latest}.`), false;

  const asset = assetName(deps.platform, deps.arch);
  const expected = (await releaseSums(deps.fetch, deps.repo, tag)).get(asset);
  if (!expected) throw new Error(`No checksum for ${asset} in SHA256SUMS`);
  const bytes = await downloadAsset(deps.fetch, deps.repo, tag, asset);

  const next = `${deps.exe}.new`;
  try {
    if (createHash("sha256").update(bytes).digest("hex") !== expected) throw new Error(`Checksum mismatch for ${asset}`);
    deps.writeFile(next, bytes);
    deps.chmod(next, 0o755);
    if (deps.platform === "win32") {
      // A running exe cannot be overwritten, but it can be renamed.
      const old = `${deps.exe}.old`;
      deps.rename(deps.exe, old);
      try {
        deps.rename(next, deps.exe);
      } catch (error) {
        deps.rename(old, deps.exe);
        throw error;
      }
    } else {
      deps.rename(next, deps.exe);
    }
  } catch (error) {
    deps.rm(next);
    throw error;
  }
  if (await deps.serviceInstalled()) await deps.restart(latest);
  deps.log(`Updated to ${latest}.`);
  return true;
}

/** The previous exe stays until the next start: a running exe cannot be deleted on Windows. */
export function removeOldBinary(exe: string, rm: (path: string) => void): void {
  try {
    rm(`${exe}.old`);
  } catch {
    // Still locked: the next start tries again.
  }
}
