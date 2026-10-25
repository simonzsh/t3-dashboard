import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "bun:test";
import { checkPayloads, type Shape } from "../../../src/integrations/t3/bundle.ts";
import { samplePayloads } from "../../../src/integrations/t3/contracts.ts";

const snapshot: Record<string, Shape> = JSON.parse(readFileSync(join(import.meta.dir, "..", "..", "..", "contracts", "t3-commands.snapshot.json"), "utf8"));

// Runs without T3: a builder change that T3 would refuse fails here before the daily check.
test("every payload the dashboard builds fits the committed T3 snapshot", () => {
  const payloads = samplePayloads();
  assert.deepEqual(Object.keys(payloads).sort(), Object.keys(snapshot).sort());
  assert.deepEqual(checkPayloads(snapshot, payloads), []);
});
