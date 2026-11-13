import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, test } from "bun:test";
import { locateTailscale, tailscaleRunner } from "../../../src/integrations/tailscale/cli.ts";

const dir = mkdtempSync(join(tmpdir(), "tailscale-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fake = (name: string, script: string): string => {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
};

test("locateTailscale prefers the env override, then PATH, then the usual places", () => {
  const exists = (path: string) => path === "/usr/local/bin/tailscale" || path === "/custom/ts";
  assert.equal(locateTailscale({ T3_DASHBOARD_TAILSCALE_BIN: "/custom/ts" }, exists, () => "/bin/tailscale"), "/custom/ts");
  assert.equal(locateTailscale({ T3_DASHBOARD_TAILSCALE_BIN: "/missing/ts" }, exists, () => "/bin/tailscale"), null);
  assert.equal(locateTailscale({}, exists, () => "/bin/tailscale"), "/bin/tailscale");
  assert.equal(locateTailscale({}, exists, () => null), "/usr/local/bin/tailscale");
  assert.equal(locateTailscale({}, () => false, () => null), null);
});

test("locateTailscale knows the macOS app and the Windows install", () => {
  const mac = "/Applications/Tailscale.app/Contents/MacOS/Tailscale";
  assert.equal(locateTailscale({}, (path) => path === mac, () => null), mac);
  const win = "C:\\Program Files\\Tailscale\\tailscale.exe";
  assert.equal(locateTailscale({ ProgramFiles: "C:\\Program Files" }, (path) => path === win, () => null), win);
});

test("the runner passes arguments as they are and keeps stdout, stderr and the exit code", async () => {
  const run = tailscaleRunner({ T3_DASHBOARD_TAILSCALE_BIN: fake("echo", 'printf "%s|" "$@"; echo oops >&2; exit 3') });
  assert.deepEqual(await run(["serve", "a b; rm -rf /"], { timeoutMs: 5000 }), { code: 3, stdout: "serve|a b; rm -rf /|", stderr: "oops\n" });
});

test("the runner flags a missing program", async () => {
  const run = tailscaleRunner({ T3_DASHBOARD_TAILSCALE_BIN: join(dir, "nope") });
  assert.deepEqual(await run(["status"], { timeoutMs: 1000 }), { code: null, missing: true, stdout: "", stderr: "" });
});

test("a slow program gives a null code and keeps the partial output", async () => {
  const run = tailscaleRunner({ T3_DASHBOARD_TAILSCALE_BIN: fake("slow", "echo partial; echo link >&2; exec sleep 30") });
  assert.deepEqual(await run([], { timeoutMs: 300 }), { code: null, stdout: "partial\n", stderr: "link\n" });
});
