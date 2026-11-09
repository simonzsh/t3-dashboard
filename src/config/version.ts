import { isMainVersion, type UpdateChannel } from "../../shared/updates.ts";
export type { UpdateChannel };

declare const BUILD_VERSION: string | undefined;

export const VERSION = typeof BUILD_VERSION === "string" ? BUILD_VERSION : "dev";

export function updateChannel(env: Record<string, string | undefined>, version: string): UpdateChannel {
  const channel = env.T3_DASHBOARD_UPDATE_CHANNEL;
  if (channel === undefined || channel === "") return isMainVersion(version) ? "main" : "stable";
  if (channel === "stable" || channel === "main") return channel;
  throw new Error("T3_DASHBOARD_UPDATE_CHANNEL must be stable or main");
}

const parts = (version: string): { numbers: number[]; pre: boolean } | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(-[^+]*)?(?:\+.*)?$/.exec(version.trim());
  return match ? { numbers: [Number(match[1]), Number(match[2]), Number(match[3])], pre: match[4] !== undefined } : null;
};

/** Main builds compare commits; stable builds compare semver. Development builds never update. */
export function isNewer(latest: string, current: string): boolean {
  if (current === "dev") return false;
  if (isMainVersion(latest)) return (isMainVersion(current) || parts(current) !== null) && latest !== current;
  if (isMainVersion(current)) return parts(latest) !== null;
  const next = parts(latest);
  const installed = parts(current);
  if (!next || !installed) return false;
  for (let i = 0; i < 3; i++) if (next.numbers[i] !== installed.numbers[i]) return next.numbers[i]! > installed.numbers[i]!;
  // Same numbers: the release beats its pre-release; two pre-releases are not compared.
  return installed.pre && !next.pre;
}
