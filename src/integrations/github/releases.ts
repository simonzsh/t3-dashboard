import { parse } from "../contract.ts";
import { IntegrationError } from "../errors.ts";
import { LatestRelease } from "./schemas.ts";

export const DEFAULT_REPO = "simonzsh/t3-dashboard";

const OS_NAMES: Record<string, string> = { darwin: "darwin", linux: "linux", win32: "windows" };

/** Windows on ARM runs the x64 build. */
export function assetName(platform: string, arch: string): string {
  const os = OS_NAMES[platform];
  const cpu = platform === "win32" ? "x64" : arch === "x64" || arch === "arm64" ? arch : undefined;
  if (!os || !cpu) throw new Error(`Platform not supported: ${platform} ${arch}`);
  return `t3-dashboard-${os}-${cpu}${platform === "win32" ? ".exe" : ""}`;
}

async function get(fetchImpl: typeof fetch, url: string, init: RequestInit | undefined, failure: (status: number) => string): Promise<Response> {
  let response: Response;
  try {
    response = await fetchImpl(url, init);
  } catch (error) {
    throw new IntegrationError((error as Error).message, { system: "github", kind: "unreachable" });
  }
  if (!response.ok) throw new IntegrationError(failure(response.status), { system: "github", kind: response.status >= 500 ? "unreachable" : "refused", status: response.status });
  return response;
}

export async function latestTag(fetchImpl: typeof fetch, repo: string): Promise<string> {
  const response = await get(fetchImpl, `https://api.github.com/repos/${repo}/releases/latest`, { headers: { accept: "application/vnd.github+json" } }, (status) => `GitHub answered ${status} for the latest release`);
  const { tag_name: tag } = parse(LatestRelease, await response.json(), { system: "github", what: "GitHub release" });
  if (tag === "") throw new IntegrationError("GitHub returned no release tag", { system: "github", kind: "protocol" });
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

const download = (fetchImpl: typeof fetch, repo: string, tag: string, file: string): Promise<Response> => {
  const url = `https://github.com/${repo}/releases/download/${tag}/${file}`;
  return get(fetchImpl, url, undefined, (status) => `Download failed (${status}): ${url}`);
};

export const releaseSums = async (fetchImpl: typeof fetch, repo: string, tag: string): Promise<Map<string, string>> =>
  parseSums(await (await download(fetchImpl, repo, tag, "SHA256SUMS")).text());

export const downloadAsset = async (fetchImpl: typeof fetch, repo: string, tag: string, asset: string): Promise<Uint8Array> =>
  new Uint8Array(await (await download(fetchImpl, repo, tag, asset)).arrayBuffer());
