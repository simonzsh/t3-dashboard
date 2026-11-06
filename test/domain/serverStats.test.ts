import assert from "node:assert/strict";
import { test } from "bun:test";
import { cpuPercent, cpuSample, createServerStats, osLabel, toDisk, type DiskStat, type ServerOs } from "../../src/domain/serverStats.ts";

type Times = { user: number; nice: number; sys: number; idle: number; irq: number };
const core = (busy: number, idle: number): { times: Times } => ({ times: { user: busy - 10, nice: 0, sys: 10, idle, irq: 0 } });

interface Rig {
  cpus: { times: Times }[];
  free: number;
  disk: DiskStat | Error;
  clock: number;
  sleeps: number[];
  statfsCalls: string[];
  stats: ReturnType<typeof createServerStats>;
}

function rig(over: Partial<Pick<Rig, "cpus" | "free" | "disk">> = {}): Rig {
  const r = { cpus: [core(100, 900)], free: 4 * 1024 ** 3, disk: { blocks: 1000, bsize: 4096, bfree: 300, bavail: 200 } as DiskStat | Error, clock: Date.parse("2026-11-06T12:00:00Z"), sleeps: [] as number[], statfsCalls: [] as string[], ...over } as Rig;
  const os: ServerOs = {
    cpus: () => r.cpus,
    totalmem: () => 16 * 1024 ** 3,
    freemem: () => r.free,
    uptime: () => 90_000,
    hostname: () => "box",
    platform: () => "linux",
  };
  r.stats = createServerStats({
    os,
    statfs: async (path) => {
      r.statfsCalls.push(path);
      if (r.disk instanceof Error) throw r.disk;
      return r.disk;
    },
    diskPath: "/home/u",
    now: () => new Date(r.clock),
    // The CPU keeps running while the first read waits: 100 busy and 100 idle ticks.
    sleep: async (ms) => {
      r.sleeps.push(ms);
      r.clock += ms;
      r.cpus = r.cpus.map((c) => core(c.times.user + c.times.sys + 100, c.times.idle + 100));
    },
  });
  return r;
}

test("cpuSample sums idle and all times over the cores", () => {
  assert.deepEqual(cpuSample([core(100, 900), core(50, 450)]), { idle: 1350, total: 1500 });
});

test("cpuPercent is the busy share of the delta, clamped; null without progress", () => {
  assert.equal(cpuPercent({ idle: 900, total: 1000 }, { idle: 1000, total: 1200 }), 50);
  assert.equal(cpuPercent({ idle: 0, total: 0 }, { idle: 50, total: 50 }), 0);
  assert.equal(cpuPercent({ idle: 100, total: 100 }, { idle: 90, total: 200 }), 100);
  assert.equal(cpuPercent({ idle: 5, total: 5 }, { idle: 5, total: 5 }), null);
});

test("toDisk follows df: percent of used plus available, not of the free blocks", () => {
  const disk = toDisk("/home/u", { blocks: 1000, bsize: 4096, bfree: 300, bavail: 200 });
  assert.equal(disk?.usedBytes, 700 * 4096);
  assert.equal(disk?.totalBytes, 1000 * 4096);
  assert.ok(Math.abs(disk!.usedPercent - (700 / 900) * 100) < 1e-9);
  assert.equal(toDisk("/x", { blocks: 0, bsize: 4096, bfree: 0, bavail: 0 }), null);
});

test("osLabel names the usual platforms and keeps the others as they are", () => {
  assert.deepEqual(["linux", "darwin", "win32", "freebsd"].map(osLabel), ["Linux", "macOS", "Windows", "freebsd"]);
});

test("the first read samples twice, 250 ms apart", async () => {
  const r = rig();
  const stats = await r.stats.get();
  assert.deepEqual(r.sleeps, [250]);
  assert.equal(stats.cpu.usedPercent, 50);
  assert.equal(stats.cpu.cores, 1);
});

test("the next read compares with the stored sample and does not sleep", async () => {
  const r = rig();
  await r.stats.get();
  r.clock += 10_000;
  r.cpus = [core(r.cpus[0]!.times.user + 10 + 300, r.cpus[0]!.times.idle + 100)];
  const stats = await r.stats.get();
  assert.deepEqual(r.sleeps, [250]);
  assert.equal(stats.cpu.usedPercent, 75);
});

test("a stored sample older than 30 s is replaced by two fresh ones", async () => {
  const r = rig();
  await r.stats.get();
  r.clock += 31_000;
  await r.stats.get();
  assert.deepEqual(r.sleeps, [250, 250]);
});

test("a read within one second returns the cached value; a later one reads again", async () => {
  const r = rig();
  const first = await r.stats.get();
  r.free = 1024 ** 3;
  assert.equal(await r.stats.get(), first);
  r.clock += 1_000;
  assert.notEqual(await r.stats.get(), first);
});

test("calls made while a read runs share it", async () => {
  const r = rig();
  const [a, b] = await Promise.all([r.stats.get(), r.stats.get()]);
  assert.equal(a, b);
  assert.deepEqual(r.sleeps, [250]);
  assert.equal(r.statfsCalls.length, 1);
});

test("no cores gives a null CPU percent and zero cores", async () => {
  const stats = await rig({ cpus: [] }).stats.get();
  assert.deepEqual(stats.cpu, { usedPercent: null, cores: 0 });
});

test("memory used is total minus free", async () => {
  const stats = await rig({ free: 4 * 1024 ** 3 }).stats.get();
  assert.deepEqual(stats.memory, { usedBytes: 12 * 1024 ** 3, totalBytes: 16 * 1024 ** 3, usedPercent: 75 });
});

test("host, OS, uptime, the disk of the home directory and the read time", async () => {
  const r = rig();
  const stats = await r.stats.get();
  assert.equal(stats.host, "box");
  assert.equal(stats.os, "Linux");
  assert.equal(stats.uptimeSeconds, 90_000);
  assert.equal(stats.disk?.path, "/home/u");
  assert.deepEqual(r.statfsCalls, ["/home/u"]);
  assert.equal(stats.readAt, new Date(r.clock).toISOString());
});

test("a failing statfs gives a null disk and the read still resolves", async () => {
  const stats = await rig({ disk: new Error("ENOENT") }).stats.get();
  assert.equal(stats.disk, null);
  assert.equal(stats.memory.totalBytes, 16 * 1024 ** 3);
});
