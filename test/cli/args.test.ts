import assert from "node:assert/strict";
import { test } from "bun:test";
import { parseArgs } from "../../src/cli/args.ts";

test("no argument means start, with the defaults", () => {
  assert.deepEqual(parseArgs([]), { command: "start", open: true, check: false });
});

test("each command and its flags are parsed", () => {
  assert.deepEqual(parseArgs(["start", "--port", "5000", "--log", "/tmp/a.log"]), { command: "start", port: 5000, log: "/tmp/a.log", open: true, check: false });
  assert.deepEqual(parseArgs(["install", "--port", "4999", "--no-open"]), { command: "install", port: 4999, open: false, check: false });
  assert.deepEqual(parseArgs(["uninstall"]), { command: "uninstall", open: true, check: false });
  assert.deepEqual(parseArgs(["update", "--check"]), { command: "update", open: true, check: true });
});

test("flags alone start the server", () => {
  assert.deepEqual(parseArgs(["--port", "5000"]), { command: "start", port: 5000, open: true, check: false });
});

test("version and help have long and short forms", () => {
  for (const flag of ["--version", "-v"]) assert.equal((parseArgs([flag]) as { command: string }).command, "version");
  for (const flag of ["--help", "-h"]) assert.equal((parseArgs([flag]) as { command: string }).command, "help");
});

test("bad input gives a usage error", () => {
  for (const argv of [["frobnicate"], ["--port", "abc"], ["--port", "70000"], ["start", "--nope"], ["install", "extra"]]) {
    assert.equal(typeof (parseArgs(argv) as { error?: string }).error, "string", argv.join(" "));
  }
});
