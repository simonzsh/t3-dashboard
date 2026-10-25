import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "bun:test";
import { update, type UpdateDeps } from "../src/update.ts";

const BINARY = new TextEncoder().encode("new binary");
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function harness(options: { version?: string; sums?: string; platform?: string; installed?: boolean } = {}) {
  const calls: string[] = [];
  const urls: string[] = [];
  const asset = options.platform === "win32" ? "t3-dashboard-windows-x64.exe" : "t3-dashboard-linux-x64";
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    if (url.endsWith("/releases/latest")) return Response.json({ tag_name: "v2.0.0" });
    if (url.endsWith("SHA256SUMS")) return new Response(options.sums ?? `${sha(BINARY)}  ${asset}\n`);
    return new Response(BINARY);
  }) as unknown as typeof fetch;
  const deps: UpdateDeps = {
    fetch: fetchImpl,
    repo: "o/r",
    version: options.version ?? "1.0.0",
    exe: "/bin/t3-dashboard",
    platform: options.platform ?? "linux",
    arch: "x64",
    writeFile: (path, bytes) => void calls.push(`write ${path} ${bytes.length}`),
    chmod: (path, mode) => void calls.push(`chmod ${path} ${mode.toString(8)}`),
    rename: (from, to) => void calls.push(`rename ${from} ${to}`),
    rm: (path) => void calls.push(`rm ${path}`),
    restart: async (version) => void calls.push(`restart ${version}`),
    serviceInstalled: async () => options.installed ?? true,
    log: (message) => void calls.push(`log ${message}`),
  };
  return { deps, calls, urls };
}

test("update downloads, verifies, replaces the binary, then restarts the service", async () => {
  const { deps, calls, urls } = harness();
  assert.equal(await update({ check: false }, deps), true);
  assert.deepEqual(urls, [
    "https://api.github.com/repos/o/r/releases/latest",
    "https://github.com/o/r/releases/download/v2.0.0/SHA256SUMS",
    "https://github.com/o/r/releases/download/v2.0.0/t3-dashboard-linux-x64",
  ]);
  assert.deepEqual(calls, [
    "write /bin/t3-dashboard.new 10",
    "chmod /bin/t3-dashboard.new 755",
    "rename /bin/t3-dashboard.new /bin/t3-dashboard",
    "restart 2.0.0",
    "log Updated to 2.0.0.",
  ]);
});

test("a checksum mismatch aborts and replaces nothing", async () => {
  const { deps, calls } = harness({ sums: `${"0".repeat(64)}  t3-dashboard-linux-x64\n` });
  await assert.rejects(update({ check: false }, deps), /checksum/i);
  assert.equal(calls.some((c) => c.startsWith("rename") || c === "restart"), false);
  assert.ok(calls.includes("rm /bin/t3-dashboard.new"));
});

test("an asset missing from SHA256SUMS aborts", async () => {
  const { deps, calls } = harness({ sums: `${sha(BINARY)}  other\n` });
  await assert.rejects(update({ check: false }, deps), /no checksum/i);
  assert.equal(calls.some((c) => c.startsWith("rename")), false);
});

test("up to date: nothing is downloaded", async () => {
  const { deps, calls, urls } = harness({ version: "2.0.0" });
  assert.equal(await update({ check: false }, deps), false);
  assert.deepEqual(calls, ["log t3-dashboard 2.0.0 is up to date."]);
  assert.equal(urls.length, 1);
});

test("a build newer than the latest release is never downgraded", async () => {
  const { deps, calls, urls } = harness({ version: "2.1.0" });
  assert.equal(await update({ check: false }, deps), false);
  assert.deepEqual(calls, ["log t3-dashboard 2.0.0 is up to date."]);
  assert.equal(urls.length, 1);
});

test("--check reports a new version without touching anything", async () => {
  const { deps, calls } = harness();
  assert.equal(await update({ check: true }, deps), false);
  assert.deepEqual(calls, ["log Update available: 1.0.0 -> 2.0.0."]);
});

test("windows: the running exe moves aside before the new one takes its place", async () => {
  const { deps, calls } = harness({ platform: "win32" });
  deps.exe = "C:\\p\\t3-dashboard.exe";
  await update({ check: false }, deps);
  const renames = calls.filter((c) => c.startsWith("rename"));
  assert.deepEqual(renames, ["rename C:\\p\\t3-dashboard.exe C:\\p\\t3-dashboard.exe.old", "rename C:\\p\\t3-dashboard.exe.new C:\\p\\t3-dashboard.exe"]);
});

test("no restart when the service is not installed", async () => {
  const { deps, calls } = harness({ installed: false });
  await update({ check: false }, deps);
  assert.equal(calls.includes("restart 2.0.0"), false);
});
