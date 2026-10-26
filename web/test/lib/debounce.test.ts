import { test } from "bun:test";
import assert from "node:assert/strict";
import { delayValue } from "../../src/lib/useDebouncedValue.ts";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("delayValue hands the value over after the delay", async () => {
  const seen: string[] = [];
  delayValue("a", 10, (v) => seen.push(v));
  assert.deepEqual(seen, []);
  await wait(30);
  assert.deepEqual(seen, ["a"]);
});

test("cancelling drops the pending value", async () => {
  const seen: string[] = [];
  const cancel = delayValue("a", 10, (v) => seen.push(v));
  cancel();
  await wait(30);
  assert.deepEqual(seen, []);
});
