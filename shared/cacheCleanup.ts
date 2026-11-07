// Regenerable caches the dashboard server can clear, from a fixed list per platform.
export type CacheTargetId = "npm" | "yarn" | "pnpm" | "uv" | "bun" | "node-compile-cache" | "mongo-memory-server";

export interface CacheTargetSize {
  id: CacheTargetId;
  label: string;
  /** Bytes a cleanup would free now; 0 when the cache is missing or cannot be read. */
  bytes: number;
}

export interface CacheCleanupPreview {
  /** False on a platform without a list of targets (Windows): the interface hides the button. */
  supported: boolean;
  targets: CacheTargetSize[];
  totalBytes: number;
}

export interface CacheTargetResult {
  id: CacheTargetId;
  label: string;
  freedBytes: number;
  /** Why the target could not be cleared completely; null on success. */
  error: string | null;
}

export interface CacheCleanupResult {
  targets: CacheTargetResult[];
  totalBytes: number;
}
