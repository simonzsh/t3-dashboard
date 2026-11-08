import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, test } from "bun:test";
import { ghRunner, locateGh } from "../../../src/integrations/github/gh.ts";

const dir = mkdtempSync(join(tmpdir(), "gh-test-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const fakeGh = (name: string, script: string): string => {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${script}\n`);
  chmodSync(path, 0o755);
  return path;
};

test("locateGh prefers the env override, then PATH, then the usual folders", () => {
  const exists = (path: string) => path === "/usr/local/bin/gh" || path === "/custom/gh";
  assert.equal(locateGh({ T3_DASHBOARD_GH_BIN: "/custom/gh" }, "/home/u", exists, () => "/bin/gh"), "/custom/gh");
  assert.equal(locateGh({ T3_DASHBOARD_GH_BIN: "/missing/gh" }, "/home/u", exists, () => "/bin/gh"), null);
  assert.equal(locateGh({}, "/home/u", exists, () => "/bin/gh"), "/bin/gh");
  assert.equal(locateGh({}, "/home/u", exists, () => null), "/usr/local/bin/gh");
  assert.equal(locateGh({}, "/home/u", () => false, () => null), null);
});

test("the runner passes the arguments as they are and keeps stdout and the exit code", async () => {
  const run = ghRunner({ T3_DASHBOARD_GH_BIN: fakeGh("echo", 'printf "%s|" "$@"; exit 3') }, "/home/u");
  assert.deepEqual(await run(["pr", "view", "a b; rm -rf /"]), { code: 3, stdout: "pr|view|a b; rm -rf /|", truncated: false, notFound: false });
});

test("the runner flags gh's not-found message but never returns stderr", async () => {
  const missing = ghRunner({ T3_DASHBOARD_GH_BIN: fakeGh("missing", 'echo "GraphQL: Could not resolve to a PullRequest with the number of 9. secret-token" >&2; exit 1') }, "/home/u");
  const result = await missing([]);
  assert.deepEqual(result, { code: 1, stdout: "", truncated: false, notFound: true });
  const other = ghRunner({ T3_DASHBOARD_GH_BIN: fakeGh("other", 'echo "HTTP 500" >&2; exit 1') }, "/home/u");
  assert.equal((await other([])).notFound, false);
});

test("the runner reports a null code when gh is missing or too slow", async () => {
  assert.equal((await ghRunner({ T3_DASHBOARD_GH_BIN: join(dir, "nope") }, "/home/u")([])).code, null);
  const slow = ghRunner({ T3_DASHBOARD_GH_BIN: fakeGh("slow", "exec sleep 30") }, "/home/u");
  assert.equal((await slow([], { timeoutMs: 200 })).code, null);
});

test("the runner cuts stdout at the byte cap and counts that as a success", async () => {
  const run = ghRunner({ T3_DASHBOARD_GH_BIN: fakeGh("big", "yes 0123456789 | head -c 100000") }, "/home/u");
  const result = await run([], { maxBytes: 1000 });
  assert.equal(result.truncated, true);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.length, 1000);
});
