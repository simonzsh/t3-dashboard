import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readdir, rm, stat, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "bun:test";
import { createCacheCleanup, type CleanupFs } from "../../src/domain/cacheCleanup.ts";

const NOW = Date.parse("2026-11-07T12:00:00Z");
const HOUR = 3_600_000;

let root: string;
let home: string;
let tmp: string;
let outside: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "cache-cleanup-"));
  home = join(root, "home");
  tmp = join(root, "tmp");
  outside = join(root, "outside");
  for (const dir of [home, tmp, outside]) await mkdir(dir, { recursive: true });
  await writeFile(join(outside, "keep.txt"), "x".repeat(500));
});

afterEach(() => rm(root, { recursive: true, force: true }));

const realFs: CleanupFs = {
  readdir: (path) => readdir(path),
  lstat: (path) => lstat(path),
  rm: (path, options) => rm(path, options),
};

const cleaner = (platform: string, fs: CleanupFs = realFs, at = NOW) => createCacheCleanup({ fs, homedir: () => home, tmpdir: () => tmp, platform, now: () => new Date(at) });

async function file(path: string, bytes: number, ageMs = 0) {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, "x".repeat(bytes));
  const at = new Date(NOW - ageMs);
  await utimes(path, at, at);
}

const exists = (path: string) => lstat(path).then(() => true, () => false);

test("sizes sums each linux cache and leaves missing ones at zero", async () => {
  await file(join(home, ".npm/_cacache/a/b.bin"), 100);
  await file(join(home, ".npm/_cacache/c.bin"), 40);
  await file(join(home, ".cache/yarn/v6/x"), 25);
  await file(join(home, ".bun/install/cache/pkg"), 7);
  const preview = await cleaner("linux").sizes();
  assert.equal(preview.supported, true);
  const bytes = Object.fromEntries(preview.targets.map((t) => [t.id, t.bytes]));
  assert.deepEqual(bytes, { npm: 140, yarn: 25, pnpm: 0, uv: 0, bun: 7, "node-compile-cache": 0, "mongo-memory-server": 0 });
  assert.equal(preview.totalBytes, 172);
});

test("sizes uses the macOS cache folders", async () => {
  await file(join(home, "Library/Caches/Yarn/v6/x"), 10);
  await file(join(home, "Library/Caches/pnpm/y"), 20);
  await file(join(home, "Library/Caches/uv/z"), 30);
  await file(join(home, ".cache/yarn/ignored"), 99);
  const preview = await cleaner("darwin").sizes();
  const bytes = Object.fromEntries(preview.targets.map((t) => [t.id, t.bytes]));
  assert.equal(bytes.yarn, 10);
  assert.equal(bytes.pnpm, 20);
  assert.equal(bytes.uv, 30);
});

test("Windows is not supported and nothing is read or removed", async () => {
  await file(join(home, ".npm/_cacache/a"), 10);
  const preview = await cleaner("win32").sizes();
  assert.deepEqual(preview, { supported: false, targets: [], totalBytes: 0 });
  assert.deepEqual(await cleaner("win32").clear(), { targets: [], totalBytes: 0 });
  assert.equal(await exists(join(home, ".npm/_cacache/a")), true);
});

test("clear removes only the allowlisted caches and reports the freed bytes", async () => {
  await file(join(home, ".npm/_cacache/a"), 100);
  await file(join(home, ".npm/_logs/keep.log"), 5);
  await file(join(home, ".bun/install/cache/pkg"), 30);
  await file(join(home, ".bun/bin/bun"), 50);
  await file(join(home, ".t3/worktrees/w/src.ts"), 9);
  await file(join(home, ".cache/huggingface/model"), 11);
  await file(join(home, "repos/app/index.ts"), 13);
  const result = await cleaner("linux").clear();
  const freed = Object.fromEntries(result.targets.map((t) => [t.id, t.freedBytes]));
  assert.equal(freed.npm, 100);
  assert.equal(freed.bun, 30);
  assert.equal(result.totalBytes, 130);
  assert.ok(result.targets.every((t) => t.error === null));
  assert.equal(await exists(join(home, ".npm/_cacache")), false);
  assert.equal(await exists(join(home, ".bun/install/cache")), false);
  for (const kept of [".npm/_logs/keep.log", ".bun/bin/bun", ".t3/worktrees/w/src.ts", ".cache/huggingface/model", "repos/app/index.ts"]) {
    assert.equal(await exists(join(home, kept)), true, kept);
  }
});

test("temp entries are sized and removed only after one hour without change", async () => {
  await file(join(tmp, "node-compile-cache/v22/a"), 60, 3 * HOUR);
  await file(join(tmp, "mongo-mem-old/db"), 40, 2 * HOUR);
  await file(join(tmp, "mongo-mem-new/db"), 80, 10 * 60_000);
  await file(join(tmp, "unrelated-old/db"), 70, 5 * HOUR);
  // Folders made on the way carry the real clock: age them too, the rule reads the newest mtime of the tree.
  for (const [name, age] of [["node-compile-cache/v22", 3 * HOUR], ["node-compile-cache", 3 * HOUR], ["mongo-mem-old", 2 * HOUR], ["mongo-mem-new", 10 * 60_000], ["unrelated-old", 5 * HOUR]] as const) {
    const at = new Date(NOW - age);
    await utimes(join(tmp, name), at, at);
  }
  const c = cleaner("linux");
  const bytes = Object.fromEntries((await c.sizes()).targets.map((t) => [t.id, t.bytes]));
  assert.equal(bytes["node-compile-cache"], 60);
  assert.equal(bytes["mongo-memory-server"], 40);
  await c.clear();
  assert.equal(await exists(join(tmp, "node-compile-cache")), false);
  assert.equal(await exists(join(tmp, "mongo-mem-old")), false);
  assert.equal(await exists(join(tmp, "mongo-mem-new/db")), true);
  assert.equal(await exists(join(tmp, "unrelated-old/db")), true);
});

test("a symlink target is neither sized nor followed", async () => {
  await mkdir(join(home, ".cache"), { recursive: true });
  await symlink(outside, join(home, ".cache/uv"));
  await symlink(outside, join(tmp, "mongo-mem-link"));
  // A clock far ahead makes the link old, so only the symlink rule can keep it.
  const c = cleaner("linux", realFs, Date.now() + 5 * HOUR);
  const bytes = Object.fromEntries((await c.sizes()).targets.map((t) => [t.id, t.bytes]));
  assert.equal(bytes.uv, 0);
  assert.equal(bytes["mongo-memory-server"], 0);
  await c.clear();
  assert.equal(await exists(join(outside, "keep.txt")), true);
  assert.equal(await exists(join(home, ".cache/uv")), true);
  assert.equal(await exists(join(tmp, "mongo-mem-link")), true);
});

test("a symlink inside a cache is removed without touching what it points to", async () => {
  await file(join(home, ".npm/_cacache/a"), 10);
  await symlink(outside, join(home, ".npm/_cacache/escape"));
  const result = await cleaner("linux").clear();
  assert.equal(await exists(join(home, ".npm/_cacache")), false);
  assert.equal((await stat(join(outside, "keep.txt"))).size, 500);
  // The link counts for its own few bytes, never for the 500 bytes behind it.
  assert.ok(result.targets.find((t) => t.id === "npm")!.freedBytes < 500);
});

test("a failing target reports its error and the others still clear", async () => {
  await file(join(home, ".npm/_cacache/a"), 100);
  await file(join(home, ".cache/pnpm/b"), 20);
  const failing: CleanupFs = {
    ...realFs,
    rm: (path, options) => (path === join(home, ".npm/_cacache") ? Promise.reject(new Error("EBUSY: locked")) : rm(path, options)),
  };
  const result = await cleaner("linux", failing).clear();
  const npm = result.targets.find((t) => t.id === "npm")!;
  const pnpm = result.targets.find((t) => t.id === "pnpm")!;
  assert.deepEqual([npm.freedBytes, npm.error], [0, "EBUSY: locked"]);
  assert.deepEqual([pnpm.freedBytes, pnpm.error], [20, null]);
  assert.equal(result.totalBytes, 20);
  assert.equal(await exists(join(home, ".cache/pnpm")), false);
});

test("two clears at once share one run", async () => {
  await file(join(home, ".npm/_cacache/a"), 100);
  let removals = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const slow: CleanupFs = {
    ...realFs,
    rm: async (path, options) => {
      removals++;
      await gate;
      return rm(path, options);
    },
  };
  const c = cleaner("linux", slow);
  const first = c.clear();
  const second = c.clear();
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(removals, 1);
  assert.deepEqual(a, b);
  assert.equal(a.totalBytes, 100);
  // Once done, the next call starts a new run.
  assert.equal((await c.clear()).totalBytes, 0);
});

test("a temp folder with a recent file inside is kept even when its own mtime is old", async () => {
  await file(join(tmp, "mongo-mem-busy/db/data"), 40, 10 * 60_000);
  const at = new Date(NOW - 5 * HOUR);
  await utimes(join(tmp, "mongo-mem-busy"), at, at);
  await utimes(join(tmp, "mongo-mem-busy/db"), at, at);
  const result = await cleaner("linux").clear();
  assert.equal(result.totalBytes, 0);
  assert.equal(await exists(join(tmp, "mongo-mem-busy/db/data")), true);
});
