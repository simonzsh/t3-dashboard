import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "bun:test";
import { redirectConsole, writePidFile } from "../src/runFiles.ts";

const tmp = () => mkdtempSync(join(tmpdir(), "t3d-run-"));

test("the pid file holds the pid and is removed by its cleanup", () => {
  const dir = tmp();
  const file = join(dir, "state", "dashboard.pid");
  const cleanup = writePidFile(file, 4242);
  assert.equal(readFileSync(file, "utf8"), "4242\n");
  cleanup();
  assert.equal(existsSync(file), false);
  rmSync(dir, { recursive: true });
});

test("cleanup leaves a pid file that another process rewrote", () => {
  const dir = tmp();
  const file = join(dir, "dashboard.pid");
  const cleanup = writePidFile(file, 1);
  writeFileSync(file, "2\n");
  cleanup();
  assert.equal(readFileSync(file, "utf8"), "2\n");
  rmSync(dir, { recursive: true });
});

test("redirectConsole appends log and error lines to the file", () => {
  const dir = tmp();
  const file = join(dir, "logs", "dashboard.log");
  const target = { log: () => {}, info: () => {}, warn: () => {}, error: () => {} } as unknown as Console;
  redirectConsole(file, target);
  target.log("hello", 1);
  target.error("bad");
  const lines = readFileSync(file, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.match(lines[0]!, /^\d{4}-\d\d-\d\dT.*Z hello 1$/);
  assert.match(lines[1]!, / bad$/);
  rmSync(dir, { recursive: true });
});
