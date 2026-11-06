import type { ServerStats } from "../../../../shared/api.ts";

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
