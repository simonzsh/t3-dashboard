declare const BUILD_VERSION: string | undefined;

export const VERSION = typeof BUILD_VERSION === "string" ? BUILD_VERSION : "dev";

const parts = (version: string): { numbers: number[]; pre: boolean } | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-[^+]*)?(?:\+.*)?$/.exec(version.trim());
  return match ? { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] !== undefined } : null;
};

/** True when `latest` is a higher semver than `current`. A version that is not semver (`dev`) is never behind. */
export function isNewer(latest: string, current: string): boolean {
  const next = parts(latest);
  const installed = parts(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) if (next.numbers[i] !== installed.numbers[i]) return next.numbers[i]! > installed.numbers[i]!;
  // Same numbers: the release beats its pre-release; two pre-releases are not compared.
  return installed.pre && !next.pre;
}
