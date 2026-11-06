// The machine the dashboard server runs on, read on each request.
export interface ServerStats {
  /** os.hostname(). */
  host: string;
  /** "Linux", "macOS", "Windows", or the raw os.platform() value. */
  os: string;
  uptimeSeconds: number;
  /** usedPercent is null when it cannot be measured, e.g. os.cpus() is empty. */
  cpu: { usedPercent: number | null; cores: number };
  memory: { usedBytes: number; totalBytes: number; usedPercent: number };
  /** The filesystem of the home directory; null when statfs fails. */
  disk: { path: string; usedBytes: number; totalBytes: number; usedPercent: number } | null;
  /** ISO time of the read. */
  readAt: string;
}
