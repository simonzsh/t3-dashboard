import { createHash } from "node:crypto";
import { isNewer } from "./updates.ts";

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

const OS_NAMES: Record<string, string> = { darwin: "darwin", linux: "linux", win32: "windows" };

/** Windows on ARM runs the x64 build. */
export function assetName(platform: string, arch: string): string {
  const os = OS_NAMES[platform];
  const cpu = platform === "win32" ? "x64" : arch === "x64" || arch === "arm64" ? arch : undefined;
  if (!os || !cpu) throw new Error(`Platform not supported: ${platform} ${arch}`);
  return `t3-dashboard-${os}-${cpu}${platform === "win32" ? ".exe" : ""}`;
}

export async function latestTag(fetchImpl: typeof fetch, repo: string): Promise<string> {
  const response = await fetchImpl(`https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: "application/vnd.github+json" } });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for the latest release`);
  const tag = ((await response.json()) as { tag_name?: unknown }).tag_name;
  if (typeof tag !== "string" || tag === "") throw new Error("GitHub returned no release tag");
  return tag;
}

/** Reads sha256sum output into a map of asset name to lowercase hex. */
export function parseSums(text: string): Map<string, string> {
  const sums = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = /^([0-9a-fA-F]{6,})\s+\*?(\S+)$/.exec(line.trim());
    if (match) sums.set(match[2]!, match[1]!.toLowerCase());
  }
  return sums;
}

async function download(fetchImpl: typeof fetch, url: string): Promise<Response> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  return response;
}

/** Resolves true when a new binary replaced the old one. */
export async function update({ check }: { check: boolean }, deps: UpdateDeps): Promise<boolean> {
  const tag = await latestTag(deps.fetch, deps.repo);
  const latest = tag.replace(/^v/, "");
  if (!isNewer(latest, deps.version)) return deps.log(`t3-dashboard ${latest} is up to date.`), false;
  if (check) return deps.log(`Update available: ${deps.version} -> ${latest}.`), false;

  const asset = assetName(deps.platform, deps.arch);
  const base = `https://github.com/${deps.repo}/releases/download/${tag}`;
  const expected = parseSums(await (await download(deps.fetch, `${base}/SHA256SUMS`)).text()).get(asset);
  if (!expected) throw new Error(`No checksum for ${asset} in SHA256SUMS`);
  const bytes = new Uint8Array(await (await download(deps.fetch, `${base}/${asset}`)).arrayBuffer());

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
