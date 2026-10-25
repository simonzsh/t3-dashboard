declare const BUILD_VERSION: string | undefined;

export const VERSION = typeof BUILD_VERSION === "string" ? BUILD_VERSION : "dev";

const parts = (version: string): number[] | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
};

/** True when `latest` is a higher semver than `current`. A version that is not semver (`dev`) is never behind. */
export function isNewer(latest: string, current: string): boolean {
  const next = parts(latest);
  const installed = parts(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) if (next[i] !== installed[i]) return next[i]! > installed[i]!;
  return false;
}
