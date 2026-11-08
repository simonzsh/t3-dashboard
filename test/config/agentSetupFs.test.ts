import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { memorySetupFs, nodeSetupFs } from "../../src/config/agentSetupFs.ts";
import type { SetupFs } from "../../src/config/agentSetupFs.ts";

// The same contract for the real and the in-memory implementation.
async function contract(fs: SetupFs, root: string) {
  assert.deepEqual(await fs.entry(`${root}/a/one.md`), { kind: "file", size: 5, symlink: false });
  assert.equal((await fs.entry(`${root}/a`))?.kind, "dir");
  assert.equal(await fs.entry(`${root}/nope`), null);
  const good = await fs.entry(`${root}/link.md`);
  assert.deepEqual([good?.kind, good?.symlink, good?.linkTarget], ["file", true, `${root}/a/one.md`]);
  const broken = await fs.entry(`${root}/broken.md`);
  assert.deepEqual([broken?.kind, broken?.symlink, broken?.linkTarget], ["missing", true, `${root}/gone.md`]);
  assert.deepEqual(await fs.list(root), ["a", "broken.md", "link.md"]);
  assert.deepEqual(await fs.list(`${root}/nope`), []);
  assert.deepEqual(await fs.readText(`${root}/a/one.md`, 100), { text: "hello", truncated: false });
  assert.deepEqual(await fs.readText(`${root}/link.md`, 3), { text: "hel", truncated: true });
  await assert.rejects(fs.readText(`${root}/broken.md`, 10));
}

test("the in-memory fs follows the contract", async () => {
  await contract(memorySetupFs({ "/r/a/one.md": "hello" }, { "/r/link.md": "/r/a/one.md", "/r/broken.md": "/r/gone.md" }), "/r");
});

test("the node fs follows the contract on a real folder", async () => {
  const root = mkdtempSync(join(tmpdir(), "setup-fs-"));
  try {
    mkdirSync(join(root, "a"));
    writeFileSync(join(root, "a", "one.md"), "hello");
    symlinkSync(join(root, "a", "one.md"), join(root, "link.md"));
    symlinkSync(join(root, "gone.md"), join(root, "broken.md"));
    await contract(nodeSetupFs(), root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("the in-memory fs lists the folders its paths imply, and counts bytes", async () => {
  const fs = memorySetupFs({ "/h/x/y/f.txt": "é" });
  assert.deepEqual(await fs.list("/h"), ["x"]);
  assert.deepEqual(await fs.list("/"), ["h"]);
  assert.equal((await fs.entry("/h/x"))?.kind, "dir");
  assert.equal((await fs.entry("/h/x/y/f.txt"))?.size, 2);
});
