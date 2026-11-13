import type { CacheCleanupResult, ServerStats } from "../../../../shared/api.ts";

const KIB = 1024;
const MIB = 1024 ** 2;
const GIB = 1024 ** 3;
const TIB = 1024 ** 4;

// One decimal under 100, none above; a value that rounds up to 100 loses its decimal.
const figure = (value: number): string => {
  const tenths = Math.round(value * 10) / 10;
  return tenths < 100 ? tenths.toFixed(1) : String(Math.round(value));
};

/** "3.9 of 15.6 GB": both numbers in the unit of the total. */
export function formatBytesPair(used: number, total: number): string {
  const [unit, label] = total >= TIB ? [TIB, "TB"] : total >= GIB ? [GIB, "GB"] : [MIB, "MB"];
  return `${figure(used / unit)} of ${figure(total / unit)} ${label}`;
}

/** "up 19 d", "up 5 h", "up 12 min". */
export function uptimeLabel(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes >= 1440) return `up ${Math.floor(minutes / 1440)} d`;
  if (minutes >= 60) return `up ${Math.floor(minutes / 60)} h`;
  return minutes >= 1 ? `up ${minutes} min` : "up <1 min";
}

/** "devbox · Linux · up 19 d". */
export const hostLine = (stats: ServerStats): string => `${stats.host} · ${stats.os} · ${uptimeLabel(stats.uptimeSeconds)}`;

export const percentLabel = (percent: number | null): string => (percent === null ? "—" : `${Math.round(percent)}%`);

/** The text a screen reader gets for one meter. */
export const meterText = (name: string, percent: number, detail?: string): string => `${name}: ${Math.round(percent)}% used${detail ? `, ${detail}` : ""}`;

/** "12.3 GB", "340 MB", "0 B". */
export function formatSize(bytes: number): string {
  if (bytes < KIB) return `${Math.round(bytes)} B`;
  const [unit, label] = bytes >= TIB ? [TIB, "TB"] : bytes >= GIB ? [GIB, "GB"] : bytes >= MIB ? [MIB, "MB"] : [KIB, "KB"];
  return `${figure(bytes / unit)} ${label}`;
}

/** The server has a list of caches for these systems only (see src/domain/cacheCleanup.ts). */
export const cacheCleanupAvailable = (stats: ServerStats): boolean => stats.os === "Linux" || stats.os === "macOS";

/** "Freed 12.3 GB." and, if a target failed, "Could not clear: uv cache (EBUSY)." */
export function cleanupSummary(result: CacheCleanupResult): string {
  const failed = result.targets.filter((t) => t.error !== null).map((t) => `${t.label} (${t.error})`);
  return `Freed ${formatSize(result.totalBytes)}.${failed.length > 0 ? ` Could not clear: ${failed.join(", ")}.` : ""}`;
}
