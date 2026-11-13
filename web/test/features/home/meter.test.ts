import { test } from "bun:test";
import assert from "node:assert/strict";
import { severityOf } from "../../../src/features/home/meter.ts";

test("severity switches at 75 and 90 percent used", () => {
  assert.equal(severityOf(74.9), "ok");
  assert.equal(severityOf(75), "warn");
  assert.equal(severityOf(89.9), "warn");
  assert.equal(severityOf(90), "danger");
});
