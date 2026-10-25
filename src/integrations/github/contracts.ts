import { Checks, type SystemReport } from "../drift.ts";
import { IntegrationError } from "../errors.ts";
import { assetName, DEFAULT_REPO, latestTag, releaseSums } from "./releases.ts";

// The binaries that selfUpdate and the install scripts download.
const TARGETS = [
  ["darwin", "x64"],
  ["darwin", "arm64"],
  ["linux", "x64"],
  ["linux", "arm64"],
  ["win32", "x64"],
] as const;
const VERSION_TAG = /^v?\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/;
const SHA256 = /^[0-9a-f]{64}$/;

/** Reads the latest release and its SHA256SUMS: no binary is downloaded. */
export async function checkGithub(fetchImpl: typeof fetch = fetch, repo = DEFAULT_REPO): Promise<SystemReport> {
  const checks = new Checks();
  let tag = "";
  // latestTag validates the release JSON: a wrong field is a protocol error, so a breaking finding.
  await checks.run("releases/latest", async () => {
    tag = await latestTag(fetchImpl, repo);
    if (!VERSION_TAG.test(tag)) checks.breaking("releases/latest: tag_name is not a version number");
  });
  if (tag === "") return checks.report("github");
  await checks.run("SHA256SUMS", async () => {
    let sums: Map<string, string>;
    try {
      sums = await releaseSums(fetchImpl, repo, tag);
    } catch (error) {
      if (error instanceof IntegrationError && error.status === 404) return checks.breaking("SHA256SUMS: not attached to the latest release");
      throw error;
    }
    for (const [platform, arch] of TARGETS) {
      const name = assetName(platform, arch);
      const sum = sums.get(name);
      if (sum === undefined) checks.breaking(`SHA256SUMS: no line for ${name}`);
      else if (!SHA256.test(sum)) checks.breaking(`SHA256SUMS: the ${name} line is not a SHA-256`);
    }
  });
  return checks.report("github");
}
