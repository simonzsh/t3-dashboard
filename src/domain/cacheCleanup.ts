import type { CacheCleanupPreview, CacheCleanupResult, CacheTargetId, CacheTargetResult, CacheTargetSize } from "../../shared/api.ts";

/** The part of node:fs/promises the cleaner uses; tests pass a wrapper to inject failures. */
export interface CleanupFs {
  readdir(path: string): Promise<string[]>;
  lstat(path: string): Promise<{ size: number; mtimeMs: number; isDirectory(): boolean; isSymbolicLink(): boolean }>;
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
}

export interface CacheCleanupOptions {
  fs: CleanupFs;
  homedir: () => string;
  tmpdir: () => string;
  platform: string;
  now: () => Date;
}

/** A temp entry in use is touched often: only older ones are fair game. */
const TEMP_MIN_AGE_MS = 60 * 60 * 1000;

interface Target {
  id: CacheTargetId;
  label: string;
  /** Every candidate path. Home caches are whole folders; temp ones are entries of the temp folder, aged. */
  paths: () => Promise<string[]>;
  aged: boolean;
}

const join = (...parts: string[]): string => parts.join("/").replace(/\/{2,}/g, "/");
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function targetsFor({ fs, homedir, tmpdir, platform }: CacheCleanupOptions): Target[] | null {
  if (platform !== "linux" && platform !== "darwin") return null;
  const home = homedir();
  const mac = platform === "darwin";
  const fixed = (id: CacheTargetId, label: string, path: string): Target => ({ id, label, paths: async () => [path], aged: false });
  const temp = (id: CacheTargetId, label: string, matches: (name: string) => boolean): Target => ({
    id,
    label,
    aged: true,
    paths: async () => (await fs.readdir(tmpdir())).filter(matches).map((name) => join(tmpdir(), name)),
  });
  return [
    fixed("npm", "npm cache", join(home, ".npm/_cacache")),
    fixed("yarn", "Yarn cache", join(home, mac ? "Library/Caches/Yarn" : ".cache/yarn")),
    fixed("pnpm", "pnpm store cache", join(home, mac ? "Library/Caches/pnpm" : ".cache/pnpm")),
    fixed("uv", "uv cache", join(home, mac ? "Library/Caches/uv" : ".cache/uv")),
    // Only the install cache: ~/.bun also holds the bun binary.
    fixed("bun", "Bun install cache", join(home, ".bun/install/cache")),
    temp("node-compile-cache", "Node compile cache (temp)", (name) => name === "node-compile-cache"),
    temp("mongo-memory-server", "MongoDB memory server data (temp)", (name) => name.startsWith("mongo-mem-")),
  ];
}

/** Clears a fixed list of regenerable caches. No method takes a path: the list is the only input. */
export function createCacheCleanup(options: CacheCleanupOptions) {
  const { fs, now } = options;
  const targets = targetsFor(options);
  let inFlight: Promise<CacheCleanupResult> | null = null;

  // lstat never follows a link; a symlink counts as nothing, so a cache cannot point the walk elsewhere.
  async function sizeOf(path: string): Promise<number> {
    const info = await fs.lstat(path);
    if (info.isSymbolicLink()) return 0;
    if (!info.isDirectory()) return info.size;
    let total = 0;
    for (const name of await fs.readdir(path)) total += await sizeOf(join(path, name)).catch(() => 0);
    return total;
  }

  /** The paths of a target that may go now, with their sizes. A missing or unreadable path counts as none. */
  async function candidates(target: Target): Promise<{ path: string; bytes: number }[]> {
    const found: { path: string; bytes: number }[] = [];
    const paths = await target.paths().catch(() => []);
    for (const path of paths) {
      try {
        const info = await fs.lstat(path);
        if (info.isSymbolicLink()) continue;
        if (target.aged && now().getTime() - info.mtimeMs < TEMP_MIN_AGE_MS) continue;
        found.push({ path, bytes: await sizeOf(path) });
      } catch {
        // Gone or unreadable: nothing to free here.
      }
    }
    return found;
  }

  const total = (items: { bytes: number }[]) => items.reduce((sum, item) => sum + item.bytes, 0);

  async function clearTarget(target: Target): Promise<CacheTargetResult> {
    let freedBytes = 0;
    let error: string | null = null;
    for (const { path, bytes } of await candidates(target)) {
      try {
        await fs.rm(path, { recursive: true, force: true });
        freedBytes += bytes;
      } catch (e) {
        error = message(e);
        // A partial removal still freed something: measure what is left.
        freedBytes += Math.max(0, bytes - (await sizeOf(path).catch(() => bytes)));
      }
    }
    return { id: target.id, label: target.label, freedBytes, error };
  }

  async function run(): Promise<CacheCleanupResult> {
    const results: CacheTargetResult[] = [];
    for (const target of targets ?? []) results.push(await clearTarget(target));
    return { targets: results, totalBytes: results.reduce((sum, r) => sum + r.freedBytes, 0) };
  }

  return {
    async sizes(): Promise<CacheCleanupPreview> {
      if (!targets) return { supported: false, targets: [], totalBytes: 0 };
      const sizes: CacheTargetSize[] = [];
      for (const target of targets) sizes.push({ id: target.id, label: target.label, bytes: total(await candidates(target)) });
      return { supported: true, targets: sizes, totalBytes: total(sizes) };
    },
    /** Two calls at once share one run, so the same folder is never removed twice at the same time. */
    clear(): Promise<CacheCleanupResult> {
      inFlight ??= run().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

export type CacheCleanup = ReturnType<typeof createCacheCleanup>;
