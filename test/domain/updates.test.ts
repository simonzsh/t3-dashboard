import assert from "node:assert/strict";
import { test } from "bun:test";
import { UpdateManager, type UpdateManagerOptions } from "../../src/domain/updates.ts";

function harness(options: Partial<UpdateManagerOptions> & { tags?: Array<string | Error> } = {}) {
  const tags = options.tags ?? ["v1.1.0"];
  let asked = 0;
  const manager = new UpdateManager({
    version: "1.0.0",
    unavailable: null,
    run: async () => true,
    latestTag: async () => {
      const tag = tags[Math.min(asked++, tags.length - 1)]!;
      if (tag instanceof Error) throw tag;
      return tag;
    },
    ...options,
  });
  return { manager };
}

test("status is empty before the first check", () => {
  const { manager } = harness();
  assert.deepEqual(manager.status(), {
    channel: "stable", current: "1.0.0", latest: null, available: false, canUpdate: true, reason: null, updating: false, error: null,
  });
});

test("a check reports a newer release without the v prefix", async () => {
  const { manager } = harness();
  const status = await manager.check();
  assert.equal(status.latest, "1.1.0");
  assert.equal(status.available, true);
});

test("the same version is not available", async () => {
  const { manager } = harness({ tags: ["v1.0.0"] });
  assert.equal((await manager.check()).available, false);
});

test("checking a main build keeps the update manual and compares commit identities", async () => {
  let runs = 0;
  const current = `main-${"a".repeat(40)}`;
  const next = `main-${"b".repeat(40)}`;
  const { manager } = harness({ version: current, tags: [current, next], run: async () => { runs++; return true; } });
  assert.equal((await manager.check()).available, false);
  assert.equal((await manager.check()).available, true);
  assert.equal(runs, 0);
  manager.apply();
  assert.equal(runs, 1);
});

test("a network error or a 404 shows nothing and keeps the last answer", async () => {
  const first = harness({ tags: [new Error("GitHub answered 404 for the latest release")] });
  const empty = await first.manager.check();
  assert.equal(empty.latest, null);
  assert.equal(empty.available, false);
  assert.equal(empty.error, null);

  const later = harness({ tags: ["v1.1.0", new Error("offline")] });
  await later.manager.check();
  const kept = await later.manager.check();
  assert.equal(kept.latest, "1.1.0");
  assert.equal(kept.error, null);
});

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

test("apply refuses when the update is unavailable", () => {
  const { manager } = harness({ unavailable: "Development build." });
  assert.deepEqual(manager.apply(), { started: false, reason: "Development build." });
  assert.equal(manager.status().canUpdate, false);
  assert.equal(manager.status().reason, "Development build.");
});

test("apply runs once at a time and clears the flag at the end", async () => {
  let release: (installed: boolean) => void = () => {};
  let runs = 0;
  const { manager } = harness({ run: () => (runs++, new Promise<boolean>((resolve) => (release = resolve))) });
  assert.deepEqual(manager.apply(), { started: true });
  assert.equal(manager.status().updating, true);
  assert.deepEqual(manager.apply(), { started: false, reason: "An update is already running." });
  release(true);
  await settle();
  assert.equal(runs, 1);
  assert.equal(manager.status().updating, false);
  assert.equal(manager.status().error, null);
});

test("a failed update keeps its message, the next start clears it", async () => {
  let fail = true;
  const { manager } = harness({ run: async () => (fail ? Promise.reject(new Error("Checksum mismatch")) : true) });
  manager.apply();
  await settle();
  assert.equal(manager.status().error, "Checksum mismatch");
  assert.equal(manager.status().updating, false);
  fail = false;
  manager.apply();
  assert.equal(manager.status().error, null);
});

test("an update that installs nothing is an error", async () => {
  const { manager } = harness({ run: async () => false });
  manager.apply();
  await settle();
  assert.equal(manager.status().error, "No newer release found.");
});

test("a successful check clears the last update error", async () => {
  const { manager } = harness({ tags: ["v1.0.1"], run: async () => false });
  manager.apply();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(manager.status().error, "No newer release found.");
  const status = await manager.check();
  assert.equal(status.error, null);
  assert.equal(status.available, true);
});

test("changing channel saves the choice and checks that source without installing", async () => {
  const saved: string[] = [];
  const asked: string[] = [];
  let installs = 0;
  const { manager } = harness({
    saveChannel: channel => { saved.push(channel); },
    latestTag: async channel => { asked.push(channel); return channel === "main" ? `main-${"a".repeat(40)}` : "v1.2.8"; },
    run: async () => { installs++; return true; },
  });
  const main = await manager.setChannel("main");
  assert.equal(main.channel, "main");
  assert.equal(main.latest, `main-${"a".repeat(40)}`);
  const stable = await manager.setChannel("stable");
  assert.equal(stable.channel, "stable");
  assert.equal(stable.latest, "1.2.8");
  assert.deepEqual(saved, ["main", "stable"]);
  assert.deepEqual(asked, ["main", "stable"]);
  assert.equal(installs, 0);
});

test("a response from the old channel cannot replace the newly selected version", async () => {
  let finish!: (tag: string) => void;
  const { manager } = harness({ latestTag: channel => channel === "stable" ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(`main-${"a".repeat(40)}`) });
  const old = manager.check();
  await manager.setChannel("main");
  finish("v9.9.9");
  await old;
  assert.equal(manager.status().latest, `main-${"a".repeat(40)}`);
  assert.equal(manager.status().channel, "main");
});

test("a channel without a build clears the previous target; failed persistence keeps the old choice", async () => {
  const { manager } = harness({ latestTag: async channel => { if (channel === "main") throw new Error("missing build"); return "v1.2.8"; } });
  await manager.check();
  const next = await manager.setChannel("main");
  assert.equal(next.latest, null);
  assert.equal(next.available, false);
  const broken = harness({ saveChannel: () => { throw new Error("disk full"); } }).manager;
  await assert.rejects(broken.setChannel("main"), /disk full/);
  assert.equal(broken.status().channel, "stable");
});

test("the channel cannot change during installation", async () => {
  const { manager } = harness({ run: () => new Promise(() => {}) });
  manager.apply();
  await assert.rejects(manager.setChannel("main"), /Wait for the update to finish/);
  assert.equal(manager.status().channel, "stable");
});
