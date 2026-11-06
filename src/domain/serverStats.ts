import type { ServerStats } from "../../shared/api.ts";

/** The part of node:os the reader uses. */
export interface ServerOs {
  cpus(): { times: { user: number; nice: number; sys: number; idle: number; irq: number } }[];
  totalmem(): number;
  freemem(): number;
  uptime(): number;
  hostname(): string;
  platform(): string;
}

export interface DiskStat {
  blocks: number;
  bsize: number;
  bfree: number;
  bavail: number;
}

export interface ServerStatsOptions {
  os: ServerOs;
  statfs: (path: string) => Promise<DiskStat>;
  diskPath: string;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
}

const CACHE_MS = 1_000;
/** Older than this, the stored CPU sample says nothing about now. */
const STALE_MS = 30_000;
const CPU_SAMPLE_MS = 250;
const PLATFORMS: Record<string, string> = { linux: "Linux", darwin: "macOS", win32: "Windows" };

interface CpuSample {
  idle: number;
  total: number;
}

export function cpuSample(cpus: ReturnType<ServerOs["cpus"]>): CpuSample {
  let idle = 0;
  let total = 0;
  for (const { times } of cpus) {
    idle += times.idle;
    total += times.user + times.nice + times.sys + times.idle + times.irq;
  }
  return { idle, total };
}

/** The busy share between two samples, 0..100; null when the clock did not move. */
export function cpuPercent(prev: CpuSample, next: CpuSample): number | null {
  const total = next.total - prev.total;
  if (total <= 0) return null;
  return clampPercent((1 - (next.idle - prev.idle) / total) * 100);
}

/** Like df: used over used plus what a user can still write, so reserved blocks do not count as free. */
export function toDisk(path: string, stat: DiskStat): NonNullable<ServerStats["disk"]> | null {
  const usedBytes = (stat.blocks - stat.bfree) * stat.bsize;
  const usable = usedBytes + stat.bavail * stat.bsize;
  if (usable <= 0) return null;
  return { path, usedBytes, totalBytes: stat.blocks * stat.bsize, usedPercent: clampPercent((usedBytes / usable) * 100) };
}

export const osLabel = (platform: string): string => PLATFORMS[platform] ?? platform;

const clampPercent = (value: number): number => Math.min(100, Math.max(0, value));

/** The CPU, memory and home disk of this machine. `get` never throws. */
export function createServerStats({ os, statfs, diskPath, now, sleep }: ServerStatsOptions) {
  let last: (CpuSample & { at: number }) | null = null;
  let cached: { at: number; stats: ServerStats } | null = null;
  let inFlight: Promise<ServerStats> | null = null;

  const readCpu = async (): Promise<ServerStats["cpu"]> => {
    let before = last;
    if (!before || now().getTime() - before.at > STALE_MS) {
      before = { ...cpuSample(os.cpus()), at: now().getTime() };
      await sleep(CPU_SAMPLE_MS);
    }
    const cpus = os.cpus();
    const after = { ...cpuSample(cpus), at: now().getTime() };
    last = after;
    return { usedPercent: cpuPercent(before, after), cores: cpus.length };
  };

  const readDisk = async (): Promise<ServerStats["disk"]> => {
    try {
      return toDisk(diskPath, await statfs(diskPath));
    } catch {
      return null;
    }
  };

  const read = async (): Promise<ServerStats> => {
    const [cpu, disk] = await Promise.all([readCpu(), readDisk()]);
    const totalBytes = os.totalmem();
    const usedBytes = totalBytes - os.freemem();
    const at = now();
    const stats: ServerStats = {
      host: os.hostname(),
      os: osLabel(os.platform()),
      uptimeSeconds: Math.floor(os.uptime()),
      cpu,
      memory: { usedBytes, totalBytes, usedPercent: totalBytes > 0 ? clampPercent((usedBytes / totalBytes) * 100) : 0 },
      disk,
      readAt: at.toISOString(),
    };
    cached = { at: at.getTime(), stats };
    return stats;
  };

  return {
    async get(): Promise<ServerStats> {
      if (cached && now().getTime() - cached.at < CACHE_MS) return cached.stats;
      inFlight ??= read().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

export type ServerStatsReader = ReturnType<typeof createServerStats>;
