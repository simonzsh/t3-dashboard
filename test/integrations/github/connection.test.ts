import assert from "node:assert/strict";
import { test } from "bun:test";
import { githubConnection } from "../../../src/integrations/github/connection.ts";
import { ghRunner, type GhResult } from "../../../src/integrations/github/gh.ts";

test("connection checks auth on github.com and never exposes command output", async () => {
  const cases: Array<[Partial<GhResult>, string]> = [
    [{ code: 0 }, "connected"], [{ code: 1 }, "not-connected"],
    [{ code: 4 }, "not-connected"], [{ code: null }, "error"],
    [{ code: 2 }, "error"], [{ code: null, missing: true }, "not-installed"],
  ];
  for (const [result, status] of cases) {
    const actual = await githubConnection(async args => {
      assert.deepEqual(args, ["auth", "status", "--hostname", "github.com"]);
      return { code: 0, stdout: "private account details", truncated: false, ...result };
    });
    assert.deepEqual(actual, { status });
  }
});

test("missing binary is distinct from an installed CLI that cannot run", async () => {
  const result = await githubConnection(ghRunner({ T3_DASHBOARD_GH_BIN: "/nonexistent/github-cli" }, "/tmp"));
  assert.deepEqual(result, { status: "not-installed" });
});
