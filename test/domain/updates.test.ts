import assert from "node:assert/strict";
import { test } from "bun:test";
import { isNewer, UpdateManager, type UpdateManagerOptions } from "../../src/domain/updates.ts";

test("isNewer compares numbers, not strings", () => {
  assert.equal(isNewer("v0.10.0", "0.9.9"), true);
  assert.equal(isNewer("1.0.0", "0.99.99"), true);
  assert.equal(isNewer("0.5.1", "0.5.0"), true);
  assert.equal(isNewer("0.5.0", "0.5.0"), false);
  assert.equal(isNewer("0.4.9", "0.5.0"), false);
});

test("a version that is not semver is never behind", () => {
  assert.equal(isNewer("9.9.9", "dev"), false);
  assert.equal(isNewer("garbage", "1.0.0"), false);
});

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
    current: "1.0.0", latest: null, available: false, canUpdate: true, reason: null, updating: false, error: null,
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
